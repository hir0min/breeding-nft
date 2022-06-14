import { ethers, upgrades, network } from "hardhat";
import { BigNumber, utils } from "ethers";

import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const minterRole = utils.keccak256(utils.toUtf8Bytes("MINTER_ROLE"));
  const [admin] = await ethers.getSigners();
  const minterAddr = process.env.MINTER_ADDR || "";
  console.log("=========== START DEPLOYING ===========\n");
  console.log("- Admin address  : ", admin.address);
  console.log("- Minter address : ", minterAddr);

  if (network.name === "bsctestnet") {
    const initialBalance = BigNumber.from(utils.parseEther("1000000000000"));

    // Deploy mock BUSD and mint to admin, minter
    const busdFactory = await ethers.getContractFactory("ERC20Test");
    const busd = await busdFactory.deploy("Binance USD", "BUSD");
    console.log("- BUSD ERC20 deployed at   : ", busd.address);

    await busd.mint(admin.address, initialBalance);
    await busd.mint(minterAddr, initialBalance);

    // Deploy mock Sing token and mint to admin, minter
    const singFactory = await ethers.getContractFactory("ERC20Test");
    const sing = await singFactory.deploy("Sing Sing", "SING");
    console.log("- SING ERC20 deployed at   : ", sing.address);

    await sing.mint(admin.address, initialBalance);
    await sing.mint(minterAddr, initialBalance);

    const gallerLaunchpadTestnetAddr =
      "0x7407d219E56309c050c5cDAE9687542234eBA584";

    const randomServiceRegistryAddr =
      "0x4141cADa751Aeb18bc2AE51065ea7e86Da379Dc4";

    const superPassFactory = await ethers.getContractFactory("SuperPass");
    const superPass = await upgrades.deployProxy(
      superPassFactory,
      [
        "SuperPass",
        "SP",
        process.env.BASE_URI,
        busd.address,
        sing.address,
        process.env.TREASURY_ADDR,
        randomServiceRegistryAddr,
      ],
      {
        initializer: "init",
      }
    );
    console.log("===> SUPER PASS DEPLOYED AT : ", superPass.address);

    // Grant minter role
    await superPass.grantRole(minterRole, process.env.MINTER_ADDR);
    console.log(`- Grant role for minter '${minterAddr}' : DONE!`);

    // Set up launchpad
    await superPass.updateMaxLaunchpadSupply(81);
    await superPass.updateLaunchpad(gallerLaunchpadTestnetAddr);
    await superPass.grantRole(minterRole, gallerLaunchpadTestnetAddr);
    console.log("- Set up launchpad : DONE!");
  }

  if (network.name === "bscmainnet") {
    const randomServiceRegistryAddr =
      "0x0F11bEA946907479e7E60548ef4c23baB6e73930";

    const gallerLaunchpadMainnetAddr =
      "0x3Bd9dA5eF7f8093CE9F2Ed76BEA101309b1AA825";
    const superPassFactory = await ethers.getContractFactory("SuperPass");
    const superPass = await upgrades.deployProxy(
      superPassFactory,
      [
        "SuperPass",
        "SP",
        process.env.BASE_URI,
        process.env.BUSD_TOKEN_ADDR,
        process.env.SING_TOKEN_ADDR,
        process.env.TREASURY_ADDR,
        randomServiceRegistryAddr,
      ],
      {
        initializer: "init",
      }
    );
    console.log("===> SUPER PASS DEPLOYED AT : ", superPass.address);

    // Grant minter role
    await superPass.grantRole(minterRole, process.env.MINTER_ADDR);
    console.log(`- Grant role for minter '${minterAddr}' : DONE!`);

    // Set up launchpad
    await superPass.updateMaxLaunchpadSupply(81);
    await superPass.updateLaunchpad(gallerLaunchpadMainnetAddr);
    await superPass.grantRole(minterRole, gallerLaunchpadMainnetAddr);
    console.log("- Set up launchpad : DONE!");
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
