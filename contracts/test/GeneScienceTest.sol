// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../libraries/LibGeneScience.sol";
import "hardhat/console.sol";

contract GeneScienceTest {
    using LibGeneScience for *;

    function ascend(
        uint8 trait1,
        uint8 trait2,
        uint256 rand
    ) external pure returns (uint8 ascension) {
        return trait1._ascend(trait2, rand);
    }

    function decode(uint256 _genes) external pure returns (uint8[] memory) {
        return _genes.decode();
    }

    function encode(uint8[] memory _traits) external pure returns (uint256) {
        return _traits.encode();
    }

    function mixGenes(
        uint256 _genes1,
        uint256 _genes2,
        uint256 _random
    ) external pure returns (uint256) {
        return _genes1.mixGenes(_genes2, _random);
    }
}
