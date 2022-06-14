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

const decodeGenes = (genes: BigNumber) => {
  const traits = [];
  for (let i = 0; i < 7; i++) {
    const mask = BigNumber.from(31).shl(i * 5);
    const trait = genes.and(mask).shr(i * 5);
    traits.push(trait);
  }
  return traits;
};

const randomTraits = () => {
  return Array.from({ length: 7 }, () => Math.floor(Math.random() * 4));
};

describe("Minter tests", async () => {
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

  it("should mint new super pass if caller is MINTER", async () => {
    const matronId = 0;
    const sireId = 0;
    const superPassId = 1; // first pass

    const singerId = 2;
    const traits = randomTraits();
    const genes = encodeTraits(traits);
    const rarity = Math.floor(Math.random() * 3);
    const to = users[0].address;

    await expect(
      superPass.connect(admin).mintSingle(singerId, genes, rarity, to)
    )
      .emit(superPass, "Birth")
      .withArgs(to, superPassId, matronId, sireId, singerId, genes, rarity);

    const totalSupply = await superPass.totalSupply();
    expect(totalSupply).deep.equal(1);

    // Check on-chain data
    const pass = await superPass.superPasses(superPassId);
    expect(pass.genes).deep.equal(genes);
    expect(pass.cooldownIndex).deep.equal(0);
    expect(pass.cooldownEndTime).deep.equal(0);
    expect(pass.matronId).deep.equal(matronId);
    expect(pass.sireId).deep.equal(sireId);
    expect(pass.siringWithId).deep.equal(0);
    expect(pass.singerId).deep.equal(singerId);
    expect(pass.generation).deep.equal(0);
    expect(pass.class).deep.equal(rarity);

    const onChainTraits = decodeGenes(pass.genes);
    for (let i = 0; i < onChainTraits.length; i++)
      expect(onChainTraits[i]).deep.equal(traits[i]);

    const owner = await superPass.ownerOf(superPassId);
    expect(owner).deep.equal(to);

    const balance = await superPass.balanceOf(to);
    expect(balance).deep.equal(1);

    const passId = await superPass.tokenOfOwnerByIndex(to, 0);
    expect(passId).deep.equal(superPassId);

    const passIdInStorage = await superPass.tokenOfOwnerByIndex(to, 0);
    expect(passIdInStorage).deep.equal(superPassId);
  });

  it("should mint next 299 original super passes if caller is MINTER", async () => {
    const maxGen0 = 300;
    for (let i = 0; i < 299; i++) {
      const matronId = 0;
      const sireId = 0;
      const superPassId = i + 2; // count from first super pass + genesis pass

      const singerId = 2;
      const traits = randomTraits();
      const genes = encodeTraits(traits);
      const rarity = Math.floor(Math.random() * 3);
      const to = users[Math.floor(Math.random() * 5)].address;

      await expect(
        superPass.connect(admin).mintSingle(singerId, genes, rarity, to)
      )
        .emit(superPass, "Birth")
        .withArgs(to, superPassId, matronId, sireId, singerId, genes, rarity);
    }

    const total = await superPass.totalSupply();
    expect(total).deep.equal(maxGen0);
  });

  it("should revert when minting if max gen0 supply exceeded", async () => {
    const singerId = 2;
    const traits = randomTraits();
    const genes = encodeTraits(traits);
    const rarity = Math.floor(Math.random() * 3);
    const to = users[Math.floor(Math.random() * 5)].address;

    await expect(
      superPass.connect(admin).mintSingle(singerId, genes, rarity, to)
    ).revertedWith("Max gen0 limit exceed: 300");
  });
});
