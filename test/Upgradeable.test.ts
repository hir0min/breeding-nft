import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  SuperPass,
  ERC20Test,
  LaunchpadTest,
  UpgradeSuperPass,
} from "../typechain";
import { BigNumber, utils, Wallet } from "ethers";

describe("Upgradeable tests", async () => {
  let busd: ERC20Test;
  let sing: ERC20Test;
  let superPass: SuperPass;
  let upgradedSuperPass: UpgradeSuperPass;
  let admin: SignerWithAddress;
  let minter: SignerWithAddress;
  let treasury: SignerWithAddress;
  let launchpad: LaunchpadTest;

  const name = "SuperPass";
  const symbol = "SP";
  const baseURI = "https://metadata-dev.singsing.net/pass/v2/97";
  const initialBalance = BigNumber.from(utils.parseEther("1000000000000"));
  const minterRole = utils.keccak256(utils.toUtf8Bytes("MINTER_ROLE"));
  const randomAddr = Wallet.createRandom().address;

  before(async () => {
    [admin, minter, treasury] = await ethers.getSigners();

    // Deploy mock BUSD and mint to admin, minter
    const busdFactory = await ethers.getContractFactory("ERC20Test", admin);
    busd = await busdFactory.deploy("Binance USD", "BUSD");

    await busd.mint(admin.address, initialBalance);
    await busd.mint(minter.address, initialBalance);

    // Deploy mock Sing token and mint to admin, minter
    const singFactory = await ethers.getContractFactory("ERC20Test", admin);
    sing = await singFactory.deploy("Sing Sing", "SING");

    await sing.mint(admin.address, initialBalance);
    await sing.mint(minter.address, initialBalance);

    // Deploy NFT Launchpad mock
    const launchpadFactory = await ethers.getContractFactory(
      "LaunchpadTest",
      admin
    );
    launchpad = await launchpadFactory.deploy();

    // Deploy mock random service
    const randomServiceFactory = await ethers.getContractFactory(
      "RandomServiceTest",
      admin
    );
    const randomService = await randomServiceFactory.deploy();

    const randomRegistryFactory = await ethers.getContractFactory(
      "RandomRegistryTest",
      admin
    );
    const randomRegistry = await randomRegistryFactory.deploy(
      randomService.address
    );

    // Deploy Super Pass using proxy pattern
    const superPassFactory = await ethers.getContractFactory(
      "SuperPass",
      admin
    );
    superPass = (await upgrades.deployProxy(
      superPassFactory,
      [
        name,
        symbol,
        baseURI,
        busd.address,
        sing.address,
        treasury.address,
        randomRegistry.address,
      ],
      {
        initializer: "init",
      }
    )) as SuperPass;

    // Grant minter role
    await superPass.connect(admin).grantRole(minterRole, minter.address);

    // Link NFT to mock launchpad
    await launchpad.setNFT(superPass.address);

    // Set up launchpad
    await superPass.connect(admin).updateMaxLaunchpadSupply(81);
    await superPass.connect(admin).updateLaunchpad(launchpad.address);
  });

  it("should upgrade contracts", async () => {
    const upgradeSuperPassFactory = await ethers.getContractFactory(
      "UpgradeSuperPass"
    );
    upgradedSuperPass = (await upgrades.upgradeProxy(
      superPass.address,
      upgradeSuperPassFactory
    )) as UpgradeSuperPass;
  });

  describe("Upgrade cores", async () => {
    it("should upgrade tokenURI", async () => {
      await expect(upgradedSuperPass.tokenURI(1)).revertedWith(
        "tokenURI() upgraded!"
      );
    });

    it("should upgrade updateBaseURI", async () => {
      await expect(upgradedSuperPass.updateBaseURI("")).revertedWith(
        "updateBaseURI() upgraded!"
      );
    });

    it("should upgrade updateRandomService", async () => {
      await expect(
        upgradedSuperPass.updateRandomService(randomAddr)
      ).revertedWith("updateRandomService() upgraded!");
    });

    it("should upgrade updateFeeTokenAddrs", async () => {
      await expect(
        upgradedSuperPass.updateFeeTokenAddrs(randomAddr, randomAddr)
      ).revertedWith("updateFeeTokenAddrs() upgraded!");
    });

    it("should upgrade updateTreasury", async () => {
      await expect(upgradedSuperPass.updateTreasury(randomAddr)).revertedWith(
        "updateTreasury() upgraded!"
      );
    });

    it("should upgrade updateMaxBreedTimes", async () => {
      await expect(upgradedSuperPass.updateMaxBreedTimes(1)).revertedWith(
        "updateMaxBreedTimes() upgraded!"
      );
    });

    it("should upgrade updateBreedingFees", async () => {
      await expect(upgradedSuperPass.updateBreedingFees(1, 1, 1)).revertedWith(
        "updateBreedingFees() upgraded!"
      );
    });

    it("should upgrade updateCooldowns", async () => {
      await expect(upgradedSuperPass.updateCooldowns(1, 1)).revertedWith(
        "updateCooldowns() upgraded!"
      );
    });

    it("should upgrade updateSamePVal", async () => {
      await expect(upgradedSuperPass.updateSamePVal(1, 1, 1)).revertedWith(
        "updateSamePVal() upgraded!"
      );
    });

    it("should upgrade updateDiffPVal", async () => {
      await expect(upgradedSuperPass.updateDiffPVal(1, 1, 1)).revertedWith(
        "updateDiffPVal() upgraded!"
      );
    });

    it("should upgrade getRandom", async () => {
      await expect(upgradedSuperPass.getRandom()).revertedWith(
        "getRandom() upgraded!"
      );
    });
  });

  describe("Upgrade breeding", async () => {
    it("should upgrade approveSiring", async () => {
      await expect(upgradedSuperPass.approveSiring(1, randomAddr)).revertedWith(
        "approveSiring() upgraded!"
      );
    });

    it("should upgrade breedWith", async () => {
      await expect(upgradedSuperPass.breedWith(1, 1)).revertedWith(
        "breedWith() upgraded!"
      );
    });

    it("should upgrade isReadyToBreed", async () => {
      await expect(upgradedSuperPass.isReadyToBreed(1)).revertedWith(
        "isReadyToBreed() upgraded!"
      );
    });

    it("should upgrade giveBirth", async () => {
      await expect(upgradedSuperPass.giveBirth(1)).revertedWith(
        "giveBirth() upgraded!"
      );
    });
  });

  describe("Upgrade launchpad", async () => {
    it("should upgrade updateMaxLaunchpadSupply", async () => {
      await expect(upgradedSuperPass.updateMaxLaunchpadSupply(1)).revertedWith(
        "updateMaxLaunchpadSupply() upgraded!"
      );
    });

    it("should upgrade updateLaunchpad", async () => {
      await expect(upgradedSuperPass.updateLaunchpad(randomAddr)).revertedWith(
        "updateLaunchpad() upgraded!"
      );
    });

    it("should upgrade mintTo", async () => {
      await expect(launchpad.mint(1)).revertedWith("minTo() upgraded!");
    });
  });
});
