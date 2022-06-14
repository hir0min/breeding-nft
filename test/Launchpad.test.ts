import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  SuperPass,
  ERC20Test,
  LaunchpadTest,
  RandomRegistryTest,
} from "../typechain";
import { BigNumber, utils } from "ethers";

describe("Launchpad tests", async () => {
  let busd: ERC20Test;
  let sing: ERC20Test;
  let superPass: SuperPass;
  let launchpad: LaunchpadTest;
  let randomRegistry: RandomRegistryTest;
  let admin: SignerWithAddress;
  let minter: SignerWithAddress;
  let treasury: SignerWithAddress;
  let users: SignerWithAddress[];

  const name = "SuperPass";
  const symbol = "SP";
  const baseURI = "https://metadata-dev.singsing.net/pass/v2/97";
  const initialBalance = BigNumber.from(utils.parseEther("1000000000000"));
  const maxLaunchpadSupply = 81;

  const minterRole = utils.keccak256(utils.toUtf8Bytes("MINTER_ROLE"));

  before(async () => {
    [admin, minter, treasury, ...users] = await ethers.getSigners();

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
    randomRegistry = await randomRegistryFactory.deploy(randomService.address);

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
  });

  describe("Config and security", async () => {
    it("should config launchpad correctly if caller is ADMIN", async () => {
      // Set up launchpad
      await superPass
        .connect(admin)
        .updateMaxLaunchpadSupply(maxLaunchpadSupply);
      await superPass.connect(admin).updateLaunchpad(launchpad.address);

      const maxSupply = await superPass.launchpadMaxSupply();
      expect(maxSupply).deep.equal(maxLaunchpadSupply);

      const linkedLaunchpad = await superPass.launchpad();
      expect(linkedLaunchpad).deep.equal(launchpad.address);
    });

    it("should revert when launchpad minting if ADMIN didn't grant minter role for it yet", async () => {
      const receiver = users[4];
      await expect(launchpad.connect(receiver).mint(4)).revertedWith(
        `AccessControl: account ${launchpad.address.toLowerCase()} is missing role ${minterRole}`
      );
    });

    it("should revert when fake launchpad call miniting", async () => {
      const fakeLaunchpadFactory = await ethers.getContractFactory(
        "LaunchpadTest",
        users[6]
      );
      const fakeLaunchpad = await fakeLaunchpadFactory.deploy();

      await fakeLaunchpad.setNFT(superPass.address);

      await expect(fakeLaunchpad.connect(users[4]).mint(100)).revertedWith(
        "LaunchpadNFT: unauthorized"
      );
    });

    it("should grant minter role for launchpad if caller is ADMIN", async () => {
      await expect(
        superPass.connect(admin).grantRole(minterRole, launchpad.address)
      )
        .emit(superPass, "RoleGranted")
        .withArgs(minterRole, launchpad.address, admin.address);
    });
  });

  describe("Mint super pass", async () => {
    it("should mint super pass if caller is launcpad contract", async () => {
      const buyer = users[3];
      const amount = 4;
      await launchpad.connect(buyer).mint(amount);

      const eventFilter = superPass.filters.Birth(buyer.address);
      const events = await superPass.queryFilter(eventFilter);

      for (let i = 0; i < events.length; i++) {
        const { event, args } = events[i];
        expect(event).deep.equal("Birth");
        expect(args.owner).deep.equal(buyer.address);
        expect(args.superPassId).deep.equal(i + 1);
        expect(args.matronId).deep.equal(0);
        expect(args.sireId).deep.equal(0);
        expect(args.singerId).deep.equal(i % 3);
        expect(args.class).deep.equal(1); // Silver only
        if (i !== 0)
          expect(events[i].args.genes).not.deep.equal(events[i - 1].args.genes);
      }

      const balance = await superPass.balanceOf(buyer.address);
      expect(balance).deep.equal(amount);

      const totalPassSupply = await superPass.totalSupply();
      expect(totalPassSupply).deep.equal(amount);

      const launchpadCurrentSupply = await superPass.launchpadSupply();
      expect(launchpadCurrentSupply).deep.equal(amount);
    });

    it("should mint next 77 super passes if caller is launcpad contract", async () => {
      const buyer = users[2];
      const amount = 77;
      await launchpad.connect(buyer).mint(amount);

      const eventFilter = superPass.filters.Birth(buyer.address);
      const events = await superPass.queryFilter(eventFilter);

      for (let i = 0; i < events.length; i++) {
        const { event, args } = events[i];
        expect(event).deep.equal("Birth");
        expect(args.owner).deep.equal(buyer.address);
        expect(args.superPassId).deep.equal(i + 5);
        expect(args.matronId).deep.equal(0);
        expect(args.sireId).deep.equal(0);
        expect(args.singerId).deep.equal((i + 1) % 3);
        expect(args.class).deep.equal(1); // Silver only
        if (i !== 0)
          expect(events[i].args.genes).not.deep.equal(events[i - 1].args.genes);
      }

      const balance = await superPass.balanceOf(buyer.address);
      expect(balance).deep.equal(amount);

      const totalPassSupply = await superPass.totalSupply();
      expect(totalPassSupply).deep.equal(maxLaunchpadSupply);

      const launchpadCurrentSupply = await superPass.launchpadSupply();
      expect(launchpadCurrentSupply).deep.equal(maxLaunchpadSupply); // current supply = 81
    });

    it("should revert when minting if max launchpad supply exceed", async () => {
      const buyer = users[2];
      const amount = 2;
      await expect(launchpad.connect(buyer).mint(amount)).revertedWith(
        "LaunchpadNFT: Exceeds maxSupply"
      );
    });
  });
});
