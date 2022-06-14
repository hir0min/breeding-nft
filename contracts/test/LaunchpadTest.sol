//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface ILaunchpadNFT {
    // return max supply config for launchpad, if no reserved will be collection's max supply
    function getMaxLaunchpadSupply() external view returns (uint256);

    // return current launchpad supply
    function getLaunchpadSupply() external view returns (uint256);

    // this function need to restrict mint permission to launchpad contract
    function mintTo(address to, uint256 size) external;
}

contract LaunchpadTest {
    address public passNFT;

    function setNFT(address _addr) external {
        passNFT = _addr;
    }

    function mint(uint256 _amount) external {
        ILaunchpadNFT(passNFT).mintTo(msg.sender, _amount);
    }

    function getMaxSupply() external view returns (uint256) {
        return ILaunchpadNFT(passNFT).getMaxLaunchpadSupply();
    }

    function getSupply() external view returns (uint256) {
        return ILaunchpadNFT(passNFT).getLaunchpadSupply();
    }
}
