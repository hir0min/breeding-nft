import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SuperPass, ERC20Test } from "../typechain";
import { BigNumber, utils } from "ethers";

const encodeTraits = (traits: number[]) => {
  let genes = BigNumber.from(0);
  for (let i = 0; i < 7; i++) genes = genes.shl(5).or(traits[6 - i]);
  return genes;
};

const randomTraits = () => {
  return Array.from({ length: 7 }, () => Math.floor(Math.random() * 4));
};

describe("User tests", async () => {
  let busd: ERC20Test;
  let sing: ERC20Test;
  let superPass: SuperPass;
  let admin: SignerWithAddress;
  let minter: SignerWithAddress;
  let treasury: SignerWithAddress;
  let users: SignerWithAddress[];

  const name = "SuperPass";
  const symbol = "SP";
  const baseURI = "https://metadata-dev.singsing.net/pass/v2/97";
  const initialBalance = BigNumber.from(utils.parseEther("1000000000000"));
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
    await launchpadFactory.deploy();

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
  });

  describe("Get onchain data", async () => {
    it("should get name and symbol", async () => {
      const n = await superPass.name();
      const s = await superPass.symbol();
      expect(n).deep.equal(name);
      expect(s).deep.equal(symbol);
    });

    it("should get user's balance", async () => {
      // mint 5 passes each for users[0] and users[1]
      const mintingAmount = 10;
      const matronId = 0;
      const sireId = 0;
      for (let i = 0; i < mintingAmount; i++) {
        const superPassId = i + 1; // count from genesis pass
        const singerId = i % 3;
        const traits = randomTraits();
        const genes = encodeTraits(traits);
        const rarity = Math.floor(Math.random() * 3);
        const to = users[i % 2].address;

        await expect(
          superPass.connect(minter).mintSingle(singerId, genes, rarity, to)
        )
          .emit(superPass, "Birth")
          .withArgs(to, superPassId, matronId, sireId, singerId, genes, rarity);
      }

      let balance = await superPass.balanceOf(users[0].address);
      expect(balance).deep.equal(5);

      balance = await superPass.balanceOf(users[1].address);
      expect(balance).deep.equal(5);
    });

    it("should get total supply", async () => {
      const total = await superPass.totalSupply();
      expect(total).deep.equal(10);
    });

    it("should get tokenURI", async () => {
      const superPassId = 5;

      const pass = await superPass.superPasses(5);

      const tokenUri = await superPass.tokenURI(superPassId);
      expect(tokenUri).deep.equal(
        `${baseURI}/${
          pass.singerId
        }/${pass.class.toString()}/${superPassId}/${pass.genes.toString()}`
      );
    });

    it("should get token of owner by index", async () => {
      const superPassId = 10; // owner is users[1]
      const tokenIndex = 4; // the 5th pass of users[1]

      const owner = await superPass.ownerOf(superPassId);
      expect(owner).deep.equal(users[1].address);

      const tokenOfOwnerByIndex = await superPass.tokenOfOwnerByIndex(
        owner,
        tokenIndex
      );
      expect(tokenOfOwnerByIndex).deep.equal(superPassId);
    });

    it("should get token by index", async () => {
      const superPassId = 10; // owner is users[1]
      const tokenIndex = 9; // the last past in tokens storage array

      const tokenByIndex = await superPass.tokenByIndex(tokenIndex);
      expect(tokenByIndex).deep.equal(superPassId);
    });
  });

  describe("Transfer super passes", async () => {
    it("should transfer super pass", async () => {
      const superPassId = 1;

      const owner = await superPass.ownerOf(superPassId);
      const balanceOwnerBefore = await superPass.balanceOf(owner);
      const sender = users[0];
      expect(owner).deep.equal(sender.address);

      const receiver = users[3];
      const balanceReceiverBefore = await superPass.balanceOf(receiver.address);

      await expect(
        superPass
          .connect(sender)
          .transferFrom(owner, receiver.address, superPassId)
      )
        .emit(superPass, "Transfer")
        .withArgs(sender.address, receiver.address, superPassId);

      const newOwner = await superPass.ownerOf(superPassId);
      expect(newOwner).deep.equal(receiver.address);

      const balanceOwner = await superPass.balanceOf(owner);
      const balanceReceiver = await superPass.balanceOf(receiver.address);
      expect(balanceOwner).deep.equal(balanceOwnerBefore.sub(1));
      expect(balanceReceiver).deep.equal(balanceReceiverBefore.add(1));
    });

    it("should transfer super pass with approval", async () => {
      const superPassId = 2;
      const owner = await superPass.ownerOf(superPassId);
      const sender = users[1];
      expect(owner).deep.equal(sender.address);

      const balanceOwnerBefore = await superPass.balanceOf(owner);

      const approveSender = users[3];
      await expect(
        superPass.connect(sender).approve(approveSender.address, superPassId)
      )
        .emit(superPass, "Approval")
        .withArgs(sender.address, approveSender.address, superPassId);

      const receiver = users[0];
      const balanceReceiverBefore = await superPass.balanceOf(receiver.address);

      await expect(
        superPass
          .connect(approveSender)
          .transferFrom(owner, receiver.address, superPassId)
      )
        .emit(superPass, "Transfer")
        .withArgs(sender.address, receiver.address, superPassId);

      const balanceOwner = await superPass.balanceOf(owner);
      const balanceReceiver = await superPass.balanceOf(receiver.address);
      expect(balanceOwner).deep.equal(balanceOwnerBefore.sub(1));
      expect(balanceReceiver).deep.equal(balanceReceiverBefore.add(1));
    });
  });
});
