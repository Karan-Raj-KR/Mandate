// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RevocationRegistry} from "../src/RevocationRegistry.sol";

contract RevocationRegistryTest is Test {
    RevocationRegistry reg;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    bytes32 constant X = keccak256("delegation-x");
    bytes32 constant Y = keccak256("delegation-y");

    event Revoked(address indexed issuer, bytes32 indexed id, uint64 at);

    function setUp() public {
        reg = new RevocationRegistry();
    }

    function test_revokeSetsFlagAndEmits() public {
        vm.warp(1_800_000_000);
        vm.expectEmit(true, true, false, true, address(reg));
        emit Revoked(alice, X, 1_800_000_000);
        vm.prank(alice);
        reg.revoke(X);
        assertTrue(reg.revoked(alice, X));
    }

    function test_doubleRevokeReverts() public {
        vm.startPrank(alice);
        reg.revoke(X);
        vm.expectRevert(RevocationRegistry.AlreadyRevoked.selector);
        reg.revoke(X);
        vm.stopPrank();
    }

    function test_cannotAffectAnotherNamespace() public {
        vm.prank(alice);
        reg.revoke(X);
        assertFalse(reg.revoked(bob, X));
        // bob can still revoke the same id in his own namespace
        vm.prank(bob);
        reg.revoke(X);
        assertTrue(reg.revoked(bob, X));
    }

    function _pairs() internal view returns (address[] memory issuers, bytes32[] memory ids) {
        issuers = new address[](3);
        ids = new bytes32[](3);
        (issuers[0], ids[0]) = (alice, X);
        (issuers[1], ids[1]) = (bob, Y);
        (issuers[2], ids[2]) = (bob, X);
    }

    function test_anyRevokedFalseWhenNone() public view {
        (address[] memory issuers, bytes32[] memory ids) = _pairs();
        assertFalse(reg.anyRevoked(issuers, ids));
    }

    function test_anyRevokedTrueWhenOneMatches() public {
        vm.prank(bob);
        reg.revoke(Y);
        (address[] memory issuers, bytes32[] memory ids) = _pairs();
        assertTrue(reg.anyRevoked(issuers, ids));
    }

    function test_anyRevokedIgnoresOtherNamespace() public {
        vm.prank(alice);
        reg.revoke(Y); // alice revokes Y, but the chain asks about (bob, Y)
        (address[] memory issuers, bytes32[] memory ids) = _pairs();
        assertFalse(reg.anyRevoked(issuers, ids));
    }

    function test_statusOfPositions() public {
        vm.prank(bob);
        reg.revoke(Y);
        (address[] memory issuers, bytes32[] memory ids) = _pairs();
        bool[] memory s = reg.statusOf(issuers, ids);
        assertEq(s.length, 3);
        assertFalse(s[0]);
        assertTrue(s[1]);
        assertFalse(s[2]);
    }

    function test_emptyArrays() public view {
        assertFalse(reg.anyRevoked(new address[](0), new bytes32[](0)));
        assertEq(reg.statusOf(new address[](0), new bytes32[](0)).length, 0);
    }

    function test_anyRevokedLengthMismatchReverts() public {
        vm.expectRevert(RevocationRegistry.LengthMismatch.selector);
        reg.anyRevoked(new address[](2), new bytes32[](1));
    }

    function test_statusOfLengthMismatchReverts() public {
        vm.expectRevert(RevocationRegistry.LengthMismatch.selector);
        reg.statusOf(new address[](1), new bytes32[](2));
    }

    function testFuzz_revokeOnlyOwnNamespace(address issuer, address other, bytes32 id) public {
        vm.assume(issuer != other);
        vm.prank(issuer);
        reg.revoke(id);
        assertTrue(reg.revoked(issuer, id));
        assertFalse(reg.revoked(other, id));
    }
}
