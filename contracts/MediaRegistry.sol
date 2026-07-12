// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RitualProof — MediaRegistry
/// @notice On-chain media-authenticity registry. Anyone submits a media
///         fingerprint plus a small forensic feature vector; the contract runs
///         an ONNX classifier ON-CHAIN via Ritual's synchronous ONNX precompile
///         (0x0800) and records an immutable verdict keyed by the media hash.
/// @dev    ONNX is a synchronous precompile — the model runs during block
///         execution and returns in the same call. No RitualWallet deposit, no
///         async callbacks. Swap the classifier any time with setModel().
contract MediaRegistry {
    // ------------------------------------------------------------------ //
    //  Constants
    // ------------------------------------------------------------------ //

    /// @dev Ritual ONNX precompile (on-chain ML inference).
    address constant ONNX = 0x0000000000000000000000000000000000000800;

    /// @dev Number of forensic features the classifier expects.
    uint256 public constant FEATURE_COUNT = 10;

    /// @dev Fixed-point scale used for the model output (score = raw / 1e6).
    int256 public constant SCORE_SCALE = 1_000_000;

    // ------------------------------------------------------------------ //
    //  Types
    // ------------------------------------------------------------------ //

    enum MediaType { Image, Video, Audio }

    struct Record {
        bool exists;        // has this hash been analyzed?
        bool isAI;          // verdict: score >= threshold
        int256 score;       // raw model score, scaled by SCORE_SCALE
        uint64 timestamp;   // block time of analysis
        address submitter;  // who recorded it
        MediaType mediaType;
        string uri;         // optional pointer (IPFS/URL) to the media
    }

    // ------------------------------------------------------------------ //
    //  Storage
    // ------------------------------------------------------------------ //

    address public owner;

    /// @notice HuggingFace ONNX model locator used as the classifier.
    string public modelId;

    /// @notice Score threshold (scaled by SCORE_SCALE). score >= threshold => AI.
    int256 public threshold;

    mapping(bytes32 => Record) private _records;
    bytes32[] private _hashes;

    // ------------------------------------------------------------------ //
    //  Events
    // ------------------------------------------------------------------ //

    event MediaVerified(
        bytes32 indexed mediaHash,
        address indexed submitter,
        bool isAI,
        int256 score,
        MediaType mediaType,
        string uri
    );
    event ModelUpdated(string modelId);
    event ThresholdUpdated(int256 threshold);
    event OwnerTransferred(address indexed from, address indexed to);

    // ------------------------------------------------------------------ //
    //  Errors
    // ------------------------------------------------------------------ //

    error NotOwner();
    error AlreadyRecorded();
    error BadFeatureLength();
    error OnnxCallFailed();

    // ------------------------------------------------------------------ //
    //  Constructor
    // ------------------------------------------------------------------ //

    constructor(string memory _modelId, int256 _threshold) {
        owner = msg.sender;
        modelId = _modelId;
        threshold = _threshold;
        emit OwnerTransferred(address(0), msg.sender);
        emit ModelUpdated(_modelId);
        emit ThresholdUpdated(_threshold);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ------------------------------------------------------------------ //
    //  Core: run the model + record the verdict
    // ------------------------------------------------------------------ //

    /// @notice Analyze media and store an immutable verdict.
    /// @param mediaHash  keccak256 fingerprint of the raw media bytes.
    /// @param features   FEATURE_COUNT float32 bit-patterns (as int32), row-major.
    /// @param mediaType  0=Image, 1=Video, 2=Audio.
    /// @param uri        optional pointer to the media (IPFS/URL); may be "".
    function analyze(
        bytes32 mediaHash,
        int32[] calldata features,
        MediaType mediaType,
        string calldata uri
    ) external returns (bool isAI, int256 score) {
        if (_records[mediaHash].exists) revert AlreadyRecorded();
        if (features.length != FEATURE_COUNT) revert BadFeatureLength();

        score = _runModel(features);
        isAI = score >= threshold;

        _records[mediaHash] = Record({
            exists: true,
            isAI: isAI,
            score: score,
            timestamp: uint64(block.timestamp),
            submitter: msg.sender,
            mediaType: mediaType,
            uri: uri
        });
        _hashes.push(mediaHash);

        emit MediaVerified(mediaHash, msg.sender, isAI, score, mediaType, uri);
    }

    /// @notice Run the classifier without recording (read-only preview).
    function previewScore(int32[] calldata features) external view returns (int256 score) {
        if (features.length != FEATURE_COUNT) revert BadFeatureLength();
        return _runModel(features);
    }

    /// @dev Encode the RitualTensor + ONNX request, call the precompile, decode
    ///      the fixed-point score. Input floats (arith 2); output fixed-point
    ///      scale 6 (arith 1) so we get a clean scaled integer back.
    function _runModel(int32[] calldata features) internal view returns (int256) {
        uint16[] memory shape = new uint16[](2);
        shape[0] = 1;
        shape[1] = uint16(FEATURE_COUNT);

        int32[] memory values = new int32[](FEATURE_COUNT);
        for (uint256 i = 0; i < FEATURE_COUNT; i++) {
            values[i] = features[i];
        }

        // RitualTensor: (dtype=5 FLOAT32, shape, values)
        bytes memory tensorData = abi.encode(uint8(5), shape, values);

        // ONNX request envelope.
        bytes memory input = abi.encode(
            bytes(modelId), // mlModelId (UTF-8)
            tensorData,     // input tensor
            uint8(2),       // inputArithmetic: IEEE754 float
            uint8(0),       // inputFixedPointScale
            uint8(1),       // outputArithmetic: fixed-point
            uint8(6),       // outputFixedPointScale: /1e6
            uint8(1)        // rounding: half-even
        );

        (bool ok, bytes memory result) = ONNX.staticcall(input);
        if (!ok) revert OnnxCallFailed();

        // Outer envelope: (bytes tensorEncoded, uint8 arith, uint8 scale, uint8 round)
        (bytes memory tensorEncoded, , , ) =
            abi.decode(result, (bytes, uint8, uint8, uint8));
        // Inner tensor: (uint8 dtype, uint16[] shape, int32[] values)
        (, , int32[] memory outValues) =
            abi.decode(tensorEncoded, (uint8, uint16[], int32[]));

        return int256(outValues[0]);
    }

    // ------------------------------------------------------------------ //
    //  Views
    // ------------------------------------------------------------------ //

    function getRecord(bytes32 mediaHash) external view returns (Record memory) {
        return _records[mediaHash];
    }

    function isVerified(bytes32 mediaHash) external view returns (bool) {
        return _records[mediaHash].exists;
    }

    function totalRecords() external view returns (uint256) {
        return _hashes.length;
    }

    function hashAt(uint256 index) external view returns (bytes32) {
        return _hashes[index];
    }

    /// @notice Return up to `count` most-recent records (newest first).
    function recent(uint256 count) external view returns (bytes32[] memory hashes, Record[] memory records) {
        uint256 n = _hashes.length;
        if (count > n) count = n;
        hashes = new bytes32[](count);
        records = new Record[](count);
        for (uint256 i = 0; i < count; i++) {
            bytes32 h = _hashes[n - 1 - i];
            hashes[i] = h;
            records[i] = _records[h];
        }
    }

    // ------------------------------------------------------------------ //
    //  Admin
    // ------------------------------------------------------------------ //

    function setModel(string calldata _modelId) external onlyOwner {
        modelId = _modelId;
        emit ModelUpdated(_modelId);
    }

    function setThreshold(int256 _threshold) external onlyOwner {
        threshold = _threshold;
        emit ThresholdUpdated(_threshold);
    }

    function transferOwnership(address to) external onlyOwner {
        emit OwnerTransferred(owner, to);
        owner = to;
    }
}
