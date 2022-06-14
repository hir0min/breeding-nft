// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IRegistry {
    function randomService(uint256 key) external returns (IRandomService);
}

interface IRandomService {
    function random() external returns (uint256);
}

contract RandomServiceTest is IRandomService {
    uint256 internal seed;

    function random() external override returns (uint256) {
        seed += 124;
        return
            uint256(
                keccak256(
                    abi.encodePacked(
                        seed,
                        block.timestamp,
                        msg.sender,
                        block.number
                    )
                )
            );
    }
}

contract RandomRegistryTest is IRegistry {
    address public service;

    constructor(address _addr) {
        service = _addr;
    }

    function randomService(uint256 key)
        external
        view
        override
        returns (IRandomService)
    {
        key;
        return IRandomService(service);
    }
}
