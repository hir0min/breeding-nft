// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library LibGeneScience {
    /**
        @dev Traits'range:
                - Pure trait     : [0, 1, 2, 3, 4]
                - Ascended/mutated traits : [4, 5, 6]
     */
    uint8 private constant MAX_PURE_TRAITS = 4;
    uint8 private constant TOTAL_TRAITS = 7;

    /**
        @dev given a characteristic and 2 genes (unsorted) - returns > 0 if the genes ascended, that's the value
        @param trait1 any trait of that characteristic
        @param trait2 any trait of that characteristic
        @param rand is expected to be a 3 bits number (0~6)
        @return ascension 0 if didnt match any ascention, OR a number from 0 to 6 for the ascended trait
     */
    function _ascend(
        uint8 trait1,
        uint8 trait2,
        uint256 rand
    ) internal pure returns (uint8 ascension) {
        uint8 smallT = trait1;
        uint8 bigT = trait2;

        if (smallT > bigT) {
            bigT = trait1;
            smallT = trait2;
        }

        if ((bigT - smallT == 1) && smallT % 2 == 0) {
            // must be at least this much to ascend
            uint256 maxRand;
            if (smallT <= MAX_PURE_TRAITS) maxRand = 1;
            else maxRand = 0;

            if (rand <= maxRand) {
                ascension = (smallT / 2) + MAX_PURE_TRAITS;
            }
        }
    }

    /**
        @dev given a number get a slice of any bits, at certain offset
        @param _n a number to be sliced
        @param _nbits how many bits long is the new number
        @param _offset how many bits to skip
     */
    function _sliceNumber(
        uint256 _n,
        uint256 _nbits,
        uint256 _offset
    ) internal pure returns (uint256) {
        // mask is made by shifting left an offset number of times
        uint256 mask = uint256((2**_nbits) - 1) << _offset;
        // AND n with mask, and trim to max of _nbits bits
        return uint256((_n & mask) >> _offset);
    }

    /**
        @dev Get a 5 bit slice from an input as a number
        @param _input bits, encoded as uint
        @param _slot from 0 to 35
     */
    function _get5Bits(uint256 _input, uint256 _slot)
        private
        pure
        returns (uint8)
    {
        return uint8(_sliceNumber(_input, uint256(5), _slot * 5));
    }

    /**
        @dev Parse a gene and returns all of 7 "trait stack" that makes the characteristics
        @param _genes singer gene
        @return the 7 traits that composes the genetic code, logically divided in stacks of 4, where only the first trait of each stack may express
     */
    function decode(uint256 _genes) internal pure returns (uint8[] memory) {
        uint8[] memory traits = new uint8[](TOTAL_TRAITS);
        uint256 i;
        for (i = 0; i < TOTAL_TRAITS; i++) {
            traits[i] = _get5Bits(_genes, i);
        }
        return traits;
    }

    /**
        @dev Given an array of traits return the number that represent genes
     */
    function encode(uint8[] memory _traits) internal pure returns (uint256) {
        uint256 genes = 0;
        for (uint256 i = 0; i < TOTAL_TRAITS; i++) {
            genes = genes << 5;
            // bitwise OR trait with _genes
            genes = genes | _traits[TOTAL_TRAITS - i - 1];
        }
        return genes;
    }

    /**
        @dev mix genes from parents
     */
    function mixGenes(
        uint256 _genes1,
        uint256 _genes2,
        uint256 _random
    ) internal pure returns (uint256) {
        uint256 random = uint256(
            keccak256(abi.encodePacked(_random, _genes1, _genes2))
        );
        uint256 randomIndex;

        uint8[] memory genes1Array = decode(_genes1);
        uint8[] memory genes2Array = decode(_genes2);
        // All traits that will belong to baby
        uint8[] memory babyArray = new uint8[](TOTAL_TRAITS);
        // A pointer to the trait we are dealing with currently

        for (uint256 traitPos = 0; traitPos < TOTAL_TRAITS; traitPos++) {
            uint8 ascendedTrait;
            uint256 rand;

            if ((genes1Array[traitPos] & 1) != (genes2Array[traitPos] & 1)) {
                rand = _sliceNumber(random, 3, randomIndex);
                randomIndex += 3;

                ascendedTrait = _ascend(
                    genes1Array[traitPos],
                    genes2Array[traitPos],
                    rand
                );
            }

            if (ascendedTrait > 0) {
                babyArray[traitPos] = uint8(ascendedTrait);
            } else {
                // did not ascend, pick one of the parent's traits for the baby
                // We use the top bit of rand for this (the bottom three bits were used
                // to check for the ascension itself).
                rand = _sliceNumber(random, 1, randomIndex);
                randomIndex += 1;

                if (rand == 0) {
                    babyArray[traitPos] = uint8(genes1Array[traitPos]);
                } else {
                    babyArray[traitPos] = uint8(genes2Array[traitPos]);
                }
            }
        }

        return encode(babyArray);
    }
}
