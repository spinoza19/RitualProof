import 'dotenv/config';
import { createPublicClient, http, defineChain, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const ritualChain = defineChain({
  id: 1979,
  name: 'Ritual',
  nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
  rpcUrls: { default: { http: [process.env.RITUAL_RPC_URL] } },
});

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const client = createPublicClient({ chain: ritualChain, transport: http() });

console.log('Deployer address :', account.address);
const [balance, chainId, block] = await Promise.all([
  client.getBalance({ address: account.address }),
  client.getChainId(),
  client.getBlockNumber(),
]);
console.log('Chain ID         :', chainId);
console.log('Latest block     :', block);
console.log('Balance          :', formatEther(balance), 'RITUAL');
