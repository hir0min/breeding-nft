import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SuperPass, ERC20Test } from "../typechain";
import { BigNumber, utils } from "ethers";

async function increaseTime(duration: number): Promise<void> {
  ethers.provider.send("evm_increaseTime", [duration]);
  ethers.provider.send("evm_mine", []);
}

async function decreaseTime(duration: number): Promise<void> {
  ethers.provider.send("evm_increaseTime", [duration * -1]);
  ethers.provider.send("evm_mine", []);
}

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

describe("Breeding tests", async () => {
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
  const days = 24 * 3600;

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

    // Issue busd and sing for user to pay breeding fees
    const balance = BigNumber.from(
      BigNumber.from(utils.parseEther("10000000000000000000000000000"))
    );

    await busd.mint(users[0].address, balance);
    await sing.mint(users[0].address, balance);

    await busd.mint(users[1].address, balance);
    await sing.mint(users[1].address, balance);

    // Approve superpass to transfer fees
    await busd.connect(users[0]).approve(superPass.address, balance);
    await sing.connect(users[0]).approve(superPass.address, balance);

    await busd.connect(users[1]).approve(superPass.address, balance);
    await sing.connect(users[1]).approve(superPass.address, balance);
  });

  describe("Validate breeding for super passes", async () => {
    it("should check if super passes are ready to breed", async () => {
      let matronId = 0;
      let sireId = 0;
      let superPassId = 1; // first pass

      let singerId = 1;
      let traits = randomTraits();
      let genes = encodeTraits(traits);
      let rarity = Math.floor(Math.random() * 3);
      let to = users[0].address;

      await expect(
        superPass.connect(admin).mintSingle(singerId, genes, rarity, to)
      )
        .emit(superPass, "Birth")
        .withArgs(to, superPassId, matronId, sireId, singerId, genes, rarity);

      let totalSupply = await superPass.totalSupply();
      expect(totalSupply).deep.equal(1);

      // Check on-chain data
      let pass = await superPass.superPasses(superPassId);
      expect(pass.genes).deep.equal(genes);
      expect(pass.cooldownIndex).deep.equal(0);
      expect(pass.cooldownEndTime).deep.equal(0);
      expect(pass.matronId).deep.equal(matronId);
      expect(pass.sireId).deep.equal(sireId);
      expect(pass.siringWithId).deep.equal(0);
      expect(pass.singerId).deep.equal(singerId);
      expect(pass.generation).deep.equal(0);
      expect(pass.class).deep.equal(rarity);

      let onChainTraits = decodeGenes(pass.genes);
      for (let i = 0; i < onChainTraits.length; i++)
        expect(onChainTraits[i]).deep.equal(traits[i]);

      let owner = await superPass.ownerOf(superPassId);
      expect(owner).deep.equal(to);

      let balance = await superPass.balanceOf(to);
      expect(balance).deep.equal(1);

      let passId = await superPass.tokenOfOwnerByIndex(to, 0);
      expect(passId).deep.equal(superPassId);

      let passIdInStorage = await superPass.tokenOfOwnerByIndex(to, 0);
      expect(passIdInStorage).deep.equal(superPassId);

      matronId = 0;
      sireId = 0;
      superPassId = 2; // second pass

      singerId = 1;
      traits = randomTraits();
      genes = encodeTraits(traits);
      rarity = 2;
      to = users[0].address;

      await expect(
        superPass.connect(admin).mintSingle(singerId, genes, rarity, to)
      )
        .emit(superPass, "Birth")
        .withArgs(to, superPassId, matronId, sireId, singerId, genes, rarity);

      totalSupply = await superPass.totalSupply();
      expect(totalSupply).deep.equal(2);

      // Check on-chain data
      pass = await superPass.superPasses(superPassId);
      expect(pass.genes).deep.equal(genes);
      expect(pass.cooldownIndex).deep.equal(0);
      expect(pass.cooldownEndTime).deep.equal(0);
      expect(pass.matronId).deep.equal(matronId);
      expect(pass.sireId).deep.equal(sireId);
      expect(pass.siringWithId).deep.equal(0);
      expect(pass.singerId).deep.equal(singerId);
      expect(pass.generation).deep.equal(0);
      expect(pass.class).deep.equal(rarity);

      onChainTraits = decodeGenes(pass.genes);
      for (let i = 0; i < onChainTraits.length; i++)
        expect(onChainTraits[i]).deep.equal(traits[i]);

      owner = await superPass.ownerOf(superPassId);
      expect(owner).deep.equal(to);

      balance = await superPass.balanceOf(to);
      expect(balance).deep.equal(2);

      passId = await superPass.tokenOfOwnerByIndex(to, 1);
      expect(passId).deep.equal(superPassId);

      passIdInStorage = await superPass.tokenOfOwnerByIndex(to, 1);
      expect(passIdInStorage).deep.equal(superPassId);

      // Check if breeding is possible
      superPassId = 1;
      let isReady = await superPass
        .connect(users[0])
        .isReadyToBreed(superPassId);
      expect(isReady).deep.equal(true);

      superPassId = 2;
      isReady = await superPass.connect(users[0]).isReadyToBreed(superPassId);
      expect(isReady).deep.equal(true);
    });

    it("should revert if super pass is genesis pass", async () => {
      const matronId = 0;
      await expect(superPass.isReadyToBreed(matronId)).revertedWith(
        "Id 0 is invalid"
      );
    });

    it("should revert if super pass is bred already", async () => {
      // mint 2 other passes
      let matronId = 0;
      let sireId = 0;
      let superPassId = 3; // 3rd pass

      let singerId = 2;
      let traits = randomTraits();
      let genes = encodeTraits(traits);
      let rarity = 1;
      let to = users[0].address;
      await expect(
        superPass.connect(admin).mintSingle(singerId, genes, rarity, to)
      )
        .emit(superPass, "Birth")
        .withArgs(to, superPassId, matronId, sireId, singerId, genes, rarity);

      matronId = 0;
      sireId = 0;
      superPassId = 4; // 4th pass

      singerId = 2;
      traits = randomTraits();
      genes = encodeTraits(traits);
      rarity = 1;
      to = users[0].address;

      await expect(
        superPass.connect(admin).mintSingle(singerId, genes, rarity, to)
      )
        .emit(superPass, "Birth")
        .withArgs(to, superPassId, matronId, sireId, singerId, genes, rarity);

      // Breed above 2 passes
      matronId = 3;
      sireId = 4;
      const owner = users[0];

      await expect(superPass.connect(owner).breedWith(matronId, sireId))
        .emit(superPass, "Pregnant")
        .withArgs(owner.address, matronId, sireId);

      const isReady = await superPass.isReadyToBreed(matronId);
      expect(isReady).deep.equal(false);
    });

    it("should revert if breeding has not cooled down yet", async () => {
      // need 1 day to cool down breeding, then forward time to 0.5 day
      await increaseTime(days / 2);

      const matronId = 3;
      const isReady = await superPass.isReadyToBreed(matronId);
      expect(isReady).deep.equal(false);

      // restore evm time
      await decreaseTime(days / 2);
    });
  });

  describe("Breed two super passes", async () => {
    it("should revert when breeding in case that ADMIN paused the contract", async () => {
      await superPass.connect(admin).pause();

      const matronId = 1;
      const sireId = 2;
      await expect(
        superPass.connect(users[0]).breedWith(matronId, sireId)
      ).revertedWith("Pausable: paused");

      await superPass.connect(admin).unpause();
    });

    it("should revert when breeding two same super passes", async () => {
      const matronId = 1;
      const sireId = 1;
      const owner = users[0];

      await expect(
        superPass.connect(owner).breedWith(matronId, sireId)
      ).revertedWith("Not valid mating pair");
    });

    it("should revert when breeding if caller is not matron's owner", async () => {
      const matronId = 1;
      const sireId = 1;

      await expect(
        superPass.connect(users[3]).breedWith(matronId, sireId)
      ).revertedWith("Caller must own the matron");
    });

    it("should breed two super passes", async () => {
      const matronId = 1;
      const sireId = 2;
      const owner = users[0];

      await expect(superPass.connect(owner).breedWith(matronId, sireId))
        .emit(superPass, "Pregnant")
        .withArgs(owner.address, matronId, sireId);

      const matronPass = await superPass.superPasses(matronId);
      const sirePass = await superPass.superPasses(sireId);

      const now = (await ethers.provider.getBlock("latest")).timestamp;

      // check cooldown end time for breeding
      expect(matronPass.cooldownEndTime).deep.equal(now + 1 * days);
      expect(sirePass.cooldownEndTime).deep.equal(now + 1 * days);

      // check cooldown index
      expect(matronPass.cooldownIndex).deep.equal(1);
      expect(sirePass.cooldownIndex).deep.equal(1);
    });

    it("should charge breeding fees", async () => {
      // mint 2 other passes
      let matronId = 0;
      let sireId = 0;
      let superPassId = 5; // 5rd pass

      let singerId = 2;
      let traits = randomTraits();
      let genes = encodeTraits(traits);
      let rarity = 1;
      let to = users[1].address;
      await expect(
        superPass.connect(admin).mintSingle(singerId, genes, rarity, to)
      )
        .emit(superPass, "Birth")
        .withArgs(to, superPassId, matronId, sireId, singerId, genes, rarity);

      matronId = 0;
      sireId = 0;
      superPassId = 6; // 6th pass

      singerId = 2;
      traits = randomTraits();
      genes = encodeTraits(traits);
      rarity = 1;
      to = users[1].address;

      await expect(
        superPass.connect(admin).mintSingle(singerId, genes, rarity, to)
      )
        .emit(superPass, "Birth")
        .withArgs(to, superPassId, matronId, sireId, singerId, genes, rarity);

      const balanceBusdBeforeOfTreasury = await busd.balanceOf(
        treasury.address
      );
      const balanceSingBeforeOfTreasury = await sing.balanceOf(
        treasury.address
      );

      const balanceBusdBeforeOfUser = await busd.balanceOf(users[1].address);
      const balanceSingBeforeOfUser = await sing.balanceOf(users[1].address);

      // Breed above 2 passes
      matronId = 5;
      sireId = 6;
      const owner = users[1];

      await expect(superPass.connect(owner).breedWith(matronId, sireId))
        .emit(superPass, "Pregnant")
        .withArgs(owner.address, matronId, sireId);

      const busdFee = BigNumber.from(utils.parseEther("20"));
      const singFee = BigNumber.from(utils.parseEther("400"));

      const treasuryBusdBalance = await busd.balanceOf(treasury.address);
      const treasurySingBalance = await sing.balanceOf(treasury.address);

      const userBusdBalance = await busd.balanceOf(users[1].address);
      const userSingBalance = await sing.balanceOf(users[1].address);

      expect(treasuryBusdBalance).deep.equal(
        balanceBusdBeforeOfTreasury.add(busdFee)
      );
      expect(treasurySingBalance).deep.equal(
        balanceSingBeforeOfTreasury.add(singFee)
      );

      expect(userBusdBalance).deep.equal(balanceBusdBeforeOfUser.sub(busdFee));
      expect(userSingBalance).deep.equal(balanceSingBeforeOfUser.sub(singFee));
    });
  });

  describe("Give birth after breeding", async () => {
    it("should revert when giving birth but breeding's not cooled down yet", async () => {
      const matronId = 5;
      await expect(superPass.giveBirth(matronId)).revertedWith(
        "Not ready to birth: matron"
      );
    });

    it("should give birth after breeding's cooled down already", async () => {
      await increaseTime(1 * days);
      const matronId = 5;
      const owner = users[1];

      const matronPass = await superPass.superPasses(matronId);

      const tx = await superPass.giveBirth(matronId);
      const receipt = await tx.wait();
      const args = receipt.events?.find((e) => {
        return e.event === "Birth";
      })?.args;

      expect(args?.owner).deep.equal(owner.address);
      expect(args?.superPassId).deep.equal(matronPass.siringWithId.add(1));
      expect(args?.matronId).deep.equal(matronId);
      expect(args?.sireId).deep.equal(matronPass.siringWithId);
      expect(args?.singerId).deep.equal(matronPass.singerId);

      const childId = 7;
      const txTime = (await ethers.provider.getBlock("latest")).timestamp;
      const childPass = await superPass.superPasses(childId);
      expect(childPass.birthTime).deep.equal(txTime);

      const childPassOwner = await superPass.ownerOf(childId);
      expect(childPassOwner).deep.equal(owner.address);
    });

    it("should breeding again after giving birth", async () => {
      // Breed above 2 passes again
      const matronId = 5;
      const sireId = 6;
      const owner = users[1];

      const balanceBusdBeforeOfTreasury = await busd.balanceOf(
        treasury.address
      );
      const balanceSingBeforeOfTreasury = await sing.balanceOf(
        treasury.address
      );

      const balanceBusdBeforeOfUser = await busd.balanceOf(users[1].address);
      const balanceSingBeforeOfUser = await sing.balanceOf(users[1].address);

      await expect(superPass.connect(owner).breedWith(matronId, sireId))
        .emit(superPass, "Pregnant")
        .withArgs(owner.address, matronId, sireId);

      const busdFee = BigNumber.from(utils.parseEther("20"));
      const singFee = BigNumber.from(utils.parseEther("2000"));

      const treasuryBusdBalance = await busd.balanceOf(treasury.address);
      const treasurySingBalance = await sing.balanceOf(treasury.address);

      const userBusdBalance = await busd.balanceOf(users[1].address);
      const userSingBalance = await sing.balanceOf(users[1].address);

      expect(treasuryBusdBalance).deep.equal(
        balanceBusdBeforeOfTreasury.add(busdFee)
      );
      expect(treasurySingBalance).deep.equal(
        balanceSingBeforeOfTreasury.add(singFee)
      );

      expect(userBusdBalance).deep.equal(balanceBusdBeforeOfUser.sub(busdFee));
      expect(userSingBalance).deep.equal(balanceSingBeforeOfUser.sub(singFee));
    });

    it("should giving 2nd birth after breeding", async () => {
      await increaseTime(3 * days);

      // Giving 2nd birth with id = 8
      const matronId = 5;
      const owner = users[1];
      const matronPass = await superPass.superPasses(matronId);

      const tx = await superPass.giveBirth(matronId);
      const receipt = await tx.wait();
      const args = receipt.events?.find((e) => {
        return e.event === "Birth";
      })?.args;

      expect(args?.owner).deep.equal(owner.address);
      expect(args?.superPassId).deep.equal(matronPass.siringWithId.add(2));
      expect(args?.matronId).deep.equal(matronId);
      expect(args?.sireId).deep.equal(matronPass.siringWithId);
      expect(args?.singerId).deep.equal(matronPass.singerId);

      const childId = 8;
      const txTime = (await ethers.provider.getBlock("latest")).timestamp;
      const childPass = await superPass.superPasses(childId);
      expect(childPass.birthTime).deep.equal(txTime);

      const childPassOwner = await superPass.ownerOf(childId);
      expect(childPassOwner).deep.equal(owner.address);
    });

    it("should breeding again after giving birth", async () => {
      // Breed above 2 passes again
      const matronId = 5;
      const sireId = 6;
      const owner = users[1];

      const balanceBusdBeforeOfTreasury = await busd.balanceOf(
        treasury.address
      );
      const balanceSingBeforeOfTreasury = await sing.balanceOf(
        treasury.address
      );

      const balanceBusdBeforeOfUser = await busd.balanceOf(users[1].address);
      const balanceSingBeforeOfUser = await sing.balanceOf(users[1].address);

      await expect(superPass.connect(owner).breedWith(matronId, sireId))
        .emit(superPass, "Pregnant")
        .withArgs(owner.address, matronId, sireId);

      const busdFee = BigNumber.from(utils.parseEther("20"));
      const singFee = BigNumber.from(utils.parseEther("3200"));

      const treasuryBusdBalance = await busd.balanceOf(treasury.address);
      const treasurySingBalance = await sing.balanceOf(treasury.address);

      const userBusdBalance = await busd.balanceOf(users[1].address);
      const userSingBalance = await sing.balanceOf(users[1].address);

      expect(treasuryBusdBalance).deep.equal(
        balanceBusdBeforeOfTreasury.add(busdFee)
      );
      expect(treasurySingBalance).deep.equal(
        balanceSingBeforeOfTreasury.add(singFee)
      );

      expect(userBusdBalance).deep.equal(balanceBusdBeforeOfUser.sub(busdFee));
      expect(userSingBalance).deep.equal(balanceSingBeforeOfUser.sub(singFee));
    });

    it("should giving 3rd birth after breeding", async () => {
      await increaseTime(5 * days);

      // Giving 2nd birth with id = 9
      const matronId = 5;
      const owner = users[1];
      const matronPass = await superPass.superPasses(matronId);

      const tx = await superPass.giveBirth(matronId);
      const receipt = await tx.wait();
      const args = receipt.events?.find((e) => {
        return e.event === "Birth";
      })?.args;

      expect(args?.owner).deep.equal(owner.address);
      expect(args?.superPassId).deep.equal(matronPass.siringWithId.add(3));
      expect(args?.matronId).deep.equal(matronId);
      expect(args?.sireId).deep.equal(matronPass.siringWithId);
      expect(args?.singerId).deep.equal(matronPass.singerId);

      const childId = 9;
      const txTime = (await ethers.provider.getBlock("latest")).timestamp;
      const childPass = await superPass.superPasses(childId);
      expect(childPass.birthTime).deep.equal(txTime);

      const childPassOwner = await superPass.ownerOf(childId);
      expect(childPassOwner).deep.equal(owner.address);
    });

    it("should revert when matron's max breeding times exceed", async () => {
      const matronId = 5;
      const sireId = 6;
      const owner = users[1];

      await expect(
        superPass.connect(owner).breedWith(matronId, sireId)
      ).revertedWith("Matron reached breeding limit");
    });

    it("should revert when sire's max breeding times exceed", async () => {
      // mint another passes
      let matronId = 0;
      let sireId = 0;
      const superPassId = 10; // 10th pass

      const singerId = 2;
      const traits = randomTraits();
      const genes = encodeTraits(traits);
      const rarity = 1;
      const to = users[1].address;
      await expect(
        superPass.connect(admin).mintSingle(singerId, genes, rarity, to)
      )
        .emit(superPass, "Birth")
        .withArgs(to, superPassId, matronId, sireId, singerId, genes, rarity);

      matronId = 10;
      sireId = 6;
      const owner = users[1];

      await expect(
        superPass.connect(owner).breedWith(matronId, sireId)
      ).revertedWith("Sire reached breeding limit");
    });
  });

  describe("Approve siring", async () => {
    it("should revert when approving siring if ADMIN paused contract", async () => {
      const sireId = 10;
      const owner = users[1];
      const breeder = users[0];

      await superPass.connect(admin).pause();

      await expect(
        superPass.connect(owner).approveSiring(sireId, breeder.address)
      ).revertedWith("Pausable: pause");

      // Unpause for next tests
      await superPass.connect(admin).unpause();
    });

    it("should revert when approving siring if caller does not own the sire", async () => {
      const sireId = 10;
      const breeder = users[0];

      const owner = await superPass.ownerOf(sireId);
      expect(owner).not.deep.equal(breeder.address);

      await expect(
        superPass.connect(breeder).approveSiring(sireId, breeder.address)
      ).revertedWith("Caller must own the sire");
    });

    it("should approve siring if caller owns the sire", async () => {
      const sireId = 10;
      const owner = users[1];
      const breeder = users[0];

      await superPass.connect(owner).approveSiring(sireId, breeder.address);

      const sireAllowedToAddress = await superPass.sireAllowedToAddress(sireId);
      expect(sireAllowedToAddress).deep.equal(breeder.address);
    });

    it("should breed with approved siring super pass", async () => {
      // mint a pass with singer Id = 2 for users[0]
      let matronId = 0;
      let sireId = 0;
      const superPassId = 11; // 11th pass

      const singerId = 2;
      const traits = randomTraits();
      const genes = encodeTraits(traits);
      const rarity = 1;
      const to = users[0].address;
      await expect(
        superPass.connect(admin).mintSingle(singerId, genes, rarity, to)
      )
        .emit(superPass, "Birth")
        .withArgs(to, superPassId, matronId, sireId, singerId, genes, rarity);

      // breed pass 11 (from users[0]) and pass 10 (approved from users[1])
      matronId = 11;
      sireId = 10;
      const breeder = users[0];

      await expect(superPass.connect(breeder).breedWith(matronId, sireId))
        .emit(superPass, "Pregnant")
        .withArgs(breeder.address, matronId, sireId);
    });

    it("should give birth after breeding with approved siring super pass", async () => {
      await increaseTime(1 * days);
      const matronId = 11;
      const owner = users[0];

      const matronPass = await superPass.superPasses(matronId);

      const tx = await superPass.giveBirth(matronId);
      const receipt = await tx.wait();
      const args = receipt.events?.find((e) => {
        return e.event === "Birth";
      })?.args;

      expect(args?.owner).deep.equal(owner.address);
      expect(args?.superPassId).deep.equal(matronPass.siringWithId.add(2));
      expect(args?.matronId).deep.equal(matronId);
      expect(args?.sireId).deep.equal(matronPass.siringWithId);
      expect(args?.singerId).deep.equal(matronPass.singerId);

      const childId = 12;
      const txTime = (await ethers.provider.getBlock("latest")).timestamp;
      const childPass = await superPass.superPasses(childId);
      expect(childPass.birthTime).deep.equal(txTime);

      const childPassOwner = await superPass.ownerOf(childId);
      expect(childPassOwner).deep.equal(owner.address);
    });
  });
});
