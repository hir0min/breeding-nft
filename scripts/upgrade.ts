import { ethers, upgrades } from "hardhat";

import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const upgradeSuperPassFactory = await ethers.getContractFactory("SuperPass");
  const superPass = await upgrades.upgradeProxy(
    process.env.SUPERPASS_PROXY_ADDR || "",
    upgradeSuperPassFactory
  );

  console.log("SuperPass upgraded to : ", superPass.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
