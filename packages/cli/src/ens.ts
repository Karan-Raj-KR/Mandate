import { parseAbi } from "viem";
import type { Address } from "viem";

// Addresses: Sepolia (ENSv2) table at https://docs.ens.domains/learn/deployments, read 2026-11-06.
// ABIs: the verified sources of those contracts on Etherscan, read 2026-11-06.
export const ENS = {
  ethRegistrar: "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3",
  verifiableFactory: "0xda70306c98e97ece36f997a21368e53298572991",
  permissionedResolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
  mockUsdc: "0x240b0316df57887dbbe58b586508b19e633a14aa",
} as const satisfies Record<string, Address>;

export const registrarAbi = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
]);

export const factoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
  "function predictProxyAddress(address deployer, uint256 salt) view returns (address)",
  "event ProxyDeployed(address sender, address proxyAddress, uint256 salt, address implementation)",
]);

export const resolverAbi = parseAbi([
  "struct Grant { address account; uint256 roleBitmap; }",
  "function initialize(Grant[] grants, bytes[] calls)",
  "function setText(bytes name, string key, string value)",
  "function multicall(bytes[] calls) returns (bytes[])",
  "function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)",
  "function roles(uint256 resource, address account) view returns (uint256)",
]);

export const erc20Abi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

/** From the PermissionedResolver docs: ROLE_SET_TEXT is 1 << 4, and each role's admin role is role << 128. */
export const ROLE_SET_TEXT = 1n << 4n;
export const ROLE_SET_TEXT_ADMIN = ROLE_SET_TEXT << 128n;
