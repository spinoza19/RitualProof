export const MEDIA_REGISTRY_ABI = [
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_modelId",
        "type": "string"
      },
      {
        "internalType": "int256",
        "name": "_threshold",
        "type": "int256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AlreadyRecorded",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadFeatureLength",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotOwner",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnnxCallFailed",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "mediaHash",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "submitter",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "isAI",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "score",
        "type": "int256"
      },
      {
        "indexed": false,
        "internalType": "enum MediaRegistry.MediaType",
        "name": "mediaType",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "uri",
        "type": "string"
      }
    ],
    "name": "MediaVerified",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "string",
        "name": "modelId",
        "type": "string"
      }
    ],
    "name": "ModelUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      }
    ],
    "name": "OwnerTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "int256",
        "name": "threshold",
        "type": "int256"
      }
    ],
    "name": "ThresholdUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "FEATURE_COUNT",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "SCORE_SCALE",
    "outputs": [
      {
        "internalType": "int256",
        "name": "",
        "type": "int256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "mediaHash",
        "type": "bytes32"
      },
      {
        "internalType": "int32[]",
        "name": "features",
        "type": "int32[]"
      },
      {
        "internalType": "enum MediaRegistry.MediaType",
        "name": "mediaType",
        "type": "uint8"
      },
      {
        "internalType": "string",
        "name": "uri",
        "type": "string"
      }
    ],
    "name": "analyze",
    "outputs": [
      {
        "internalType": "bool",
        "name": "isAI",
        "type": "bool"
      },
      {
        "internalType": "int256",
        "name": "score",
        "type": "int256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "mediaHash",
        "type": "bytes32"
      }
    ],
    "name": "getRecord",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "isAI",
            "type": "bool"
          },
          {
            "internalType": "int256",
            "name": "score",
            "type": "int256"
          },
          {
            "internalType": "uint64",
            "name": "timestamp",
            "type": "uint64"
          },
          {
            "internalType": "address",
            "name": "submitter",
            "type": "address"
          },
          {
            "internalType": "enum MediaRegistry.MediaType",
            "name": "mediaType",
            "type": "uint8"
          },
          {
            "internalType": "string",
            "name": "uri",
            "type": "string"
          }
        ],
        "internalType": "struct MediaRegistry.Record",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      }
    ],
    "name": "hashAt",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "mediaHash",
        "type": "bytes32"
      }
    ],
    "name": "isVerified",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "modelId",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "int32[]",
        "name": "features",
        "type": "int32[]"
      }
    ],
    "name": "previewScore",
    "outputs": [
      {
        "internalType": "int256",
        "name": "score",
        "type": "int256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "count",
        "type": "uint256"
      }
    ],
    "name": "recent",
    "outputs": [
      {
        "internalType": "bytes32[]",
        "name": "hashes",
        "type": "bytes32[]"
      },
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "isAI",
            "type": "bool"
          },
          {
            "internalType": "int256",
            "name": "score",
            "type": "int256"
          },
          {
            "internalType": "uint64",
            "name": "timestamp",
            "type": "uint64"
          },
          {
            "internalType": "address",
            "name": "submitter",
            "type": "address"
          },
          {
            "internalType": "enum MediaRegistry.MediaType",
            "name": "mediaType",
            "type": "uint8"
          },
          {
            "internalType": "string",
            "name": "uri",
            "type": "string"
          }
        ],
        "internalType": "struct MediaRegistry.Record[]",
        "name": "records",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_modelId",
        "type": "string"
      }
    ],
    "name": "setModel",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "int256",
        "name": "_threshold",
        "type": "int256"
      }
    ],
    "name": "setThreshold",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "threshold",
    "outputs": [
      {
        "internalType": "int256",
        "name": "",
        "type": "int256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalRecords",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];
