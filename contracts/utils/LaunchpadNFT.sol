// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

abstract contract LaunchpadNFT {
    uint256 public launchpadMaxSupply;
    uint256 public launchpadSupply;
    address public launchpad;

    modifier onlyLaunchpad() {
        require(launchpad != address(0), "LaunchpadNFT: launchpad not set");
        require(msg.sender == launchpad, "LaunchpadNFT: unauthorized");
        _;
    }

    function mintTo(address to, uint256 size) external onlyLaunchpad {
        require(
            launchpadSupply + size <= launchpadMaxSupply,
            "LaunchpadNFT: Exceeds maxSupply"
        );
        _mintTo(to, size);
    }

    function getLaunchpad() external view returns (address) {
        return launchpad;
    }

    function getMaxLaunchpadSupply() external view returns (uint256) {
        return launchpadMaxSupply;
    }

    function getLaunchpadSupply() external view returns (uint256) {
        return launchpadSupply;
    }

    function _mintTo(address _to, uint256 _amount) internal virtual;
}
