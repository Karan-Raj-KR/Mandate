// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Records revocations in the revoker's own namespace. It does not prove a
/// delegation exists — existence and validity come from the signed token.
/// Cascade is a property of chain verification: every (issuer, id) pair in a
/// presented chain must be unrevoked, so revoking an ancestor rejects all
/// descendants with no enumeration.
contract RevocationRegistry {
    mapping(address => mapping(bytes32 => bool)) public revoked;

    event Revoked(address indexed issuer, bytes32 indexed id, uint64 at);

    error LengthMismatch();
    error AlreadyRevoked();

    function revoke(bytes32 id) external {
        if (revoked[msg.sender][id]) revert AlreadyRevoked();
        revoked[msg.sender][id] = true;
        emit Revoked(msg.sender, id, uint64(block.timestamp));
    }

    function anyRevoked(address[] calldata issuers, bytes32[] calldata ids)
        external view returns (bool)
    {
        if (issuers.length != ids.length) revert LengthMismatch();
        for (uint256 i; i < ids.length; ++i) {
            if (revoked[issuers[i]][ids[i]]) return true;
        }
        return false;
    }

    function statusOf(address[] calldata issuers, bytes32[] calldata ids)
        external view returns (bool[] memory out)
    {
        if (issuers.length != ids.length) revert LengthMismatch();
        out = new bool[](ids.length);
        for (uint256 i; i < ids.length; ++i) out[i] = revoked[issuers[i]][ids[i]];
    }
}
