import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  SuperPass,
  ERC20Test,
  LaunchpadTest,
  RandomRegistryTest,
} from "../typechain";
import { BigNumber, constants, Wallet, utils } from "ethers";

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

describe("Admin tests", async () => {
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
  const days = 24 * 3600;
  const maxClassIndex = 2; // Bronze = 0, Silver = 1, Gold = 2

  const defaultAdminRole = constants.HashZero;
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
  });

  it("should deploy Factory contract using proxy pattern", async () => {
    const superPassFactory = await ethers.getContractFactory(
      "SuperPass",
      admin
    );
    superPass = (await upgrades.deployProxy(
      superPassFactory,
      [
        name,
        symbol,
        "baseURI",
        busd.address,
        sing.address,
        Wallet.createRandom().address,
        Wallet.createRandom().address,
      ],
      {
        initializer: "init",
      }
    )) as SuperPass;
  });

  describe("Update base URI", async () => {
    it("should update base URI if caller is ADMIN", async () => {
      await superPass.connect(admin).updateBaseURI(baseURI);

      const res = await superPass.baseURI();
      expect(res).deep.equal(baseURI);
    });

    it("should revert when updating base URI if caller is NOT ADMIN", async () => {
      await expect(
        superPass.connect(minter).updateBaseURI(baseURI)
      ).revertedWith(
        `AccessControl: account ${minter.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });

    it("should revert when updating base URI to empty string", async () => {
      await expect(superPass.connect(admin).updateBaseURI("")).revertedWith(
        "Empty URI"
      );
    });
  });

  describe("Update random service", async () => {
    it("should set random service if caller is ADMIN", async () => {
      await superPass
        .connect(admin)
        .updateRandomService(randomRegistry.address);

      const res = await superPass.randomService();
      expect(res).deep.equal(randomRegistry.address);
    });

    it("should revert when updating random service if caller is NOT ADMIN", async () => {
      await expect(
        superPass.connect(minter).updateRandomService(randomRegistry.address)
      ).revertedWith(
        `AccessControl: account ${minter.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });

    it("should revert when updating random service address to address zero", async () => {
      await expect(
        superPass.connect(admin).updateRandomService(constants.AddressZero)
      ).revertedWith("Set zero address");
    });

    it("should revert when updating random service to address set already", async () => {
      await expect(
        superPass.connect(admin).updateRandomService(randomRegistry.address)
      ).revertedWith("Address set already");
    });
  });

  describe("Update token addresses for charging fee", async () => {
    it("should set token addresses if caller is ADMIN", async () => {
      await superPass
        .connect(admin)
        .updateFeeTokenAddrs(busd.address, sing.address);

      const busdAddr = await superPass.busdToken();
      expect(busdAddr).deep.equal(busd.address);
    });

    it("should revert when seting token addresses if caller is NOT ADMIN", async () => {
      await expect(
        superPass
          .connect(users[0])
          .updateFeeTokenAddrs(busd.address, sing.address)
      ).revertedWith(
        `AccessControl: account ${users[0].address.toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });

    it("should revert when seting token addresses to address zeros", async () => {
      await expect(
        superPass
          .connect(admin)
          .updateFeeTokenAddrs(constants.AddressZero, sing.address)
      ).revertedWith("Set zero address");
    });
  });

  describe("Update treasury", async () => {
    it("should set treasury if caller is ADMIN", async () => {
      await superPass.connect(admin).updateTreasury(treasury.address);

      const res = await superPass.treasury();
      expect(res).deep.equal(treasury.address);
    });

    it("should revert when updating treasury if caller is NOT ADMIN", async () => {
      await expect(
        superPass
          .connect(users[0])
          .updateTreasury(Wallet.createRandom().address)
      ).revertedWith(
        `AccessControl: account ${users[0].address.toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });

    it("should revert when updating treasury to address zero", async () => {
      await expect(
        superPass.connect(admin).updateTreasury(constants.AddressZero)
      ).revertedWith("Set zero address");
    });

    it("should revert when updating treasury to existing one", async () => {
      await expect(
        superPass.connect(admin).updateTreasury(treasury.address)
      ).revertedWith("Address set already");
    });
  });

  describe("Update max breeding times", async () => {
    it("should update max breeding times if caller is ADMIN", async () => {
      let newUpdate = 2;
      await superPass.connect(admin).updateMaxBreedTimes(newUpdate);

      let res = await superPass.maxBreedTimes();
      expect(res).deep.equal(newUpdate);

      newUpdate = 4;
      await superPass.connect(admin).updateMaxBreedTimes(newUpdate);

      res = await superPass.maxBreedTimes();
      expect(res).deep.equal(4);

      let busdFee = await superPass.busdFee(2);
      let singFee = await superPass.singFee(2);
      let cooldown = await superPass.cooldowns(2);
      expect(busdFee).deep.equal(BigNumber.from(utils.parseEther("10")).mul(3));
      expect(singFee).deep.equal(BigNumber.from(utils.parseEther("10000")));
      expect(cooldown).deep.equal(5 * days);

      busdFee = await superPass.busdFee(3);
      singFee = await superPass.singFee(3);
      cooldown = await superPass.cooldowns(3);
      expect(busdFee).deep.equal(BigNumber.from(utils.parseEther("10")).mul(4));
      expect(singFee).deep.equal(BigNumber.from(utils.parseEther("10000")));
      expect(cooldown).deep.equal(7 * days);
    });

    it("should revert when updating max breeding times if caller is NOT ADMIN", async () => {
      await expect(
        superPass.connect(users[0]).updateMaxBreedTimes(100)
      ).revertedWith(
        `AccessControl: account ${users[0].address.toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });
  });

  describe("Update breeding fees", async () => {
    it("should update breeding fees if caller is ADMIN", async () => {
      const idx = 3;
      const updateBusdFee = BigNumber.from(utils.parseEther("15"));
      const updateSingFee = BigNumber.from(utils.parseEther("20000"));
      await superPass
        .connect(admin)
        .updateBreedingFees(idx, updateBusdFee, updateSingFee);

      const busdFee = await superPass.busdFee(idx);
      const singFee = await superPass.singFee(idx);
      expect(busdFee).deep.equal(updateBusdFee);
      expect(singFee).deep.equal(updateSingFee);
    });

    it("should revert when updating breeding if caller is NOT ADMIN", async () => {
      await expect(
        superPass
          .connect(minter)
          .updateBreedingFees(
            2,
            BigNumber.from(utils.parseEther("15")),
            BigNumber.from(utils.parseEther("15"))
          )
      ).revertedWith(
        `AccessControl: account ${minter.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });

    it("should revert when updating breeding by out-of-bounds index", async () => {
      await expect(
        superPass
          .connect(admin)
          .updateBreedingFees(
            5,
            BigNumber.from(utils.parseEther("15")),
            BigNumber.from(utils.parseEther("15"))
          )
      ).revertedWith("Out of bounds");
    });
  });

  describe("Update cooldowns", async () => {
    it("should update cooldown if caller is ADMIN", async () => {
      await superPass.connect(admin).updateCooldowns(3, 6 * days);
      const cooldown = await superPass.cooldowns(3);
      expect(cooldown).deep.equal(6 * days);
    });

    it("should revert when updating cooldown if caller is NOT ADMIN", async () => {
      await expect(
        superPass.connect(minter).updateCooldowns(3, 6 * days)
      ).revertedWith(
        `AccessControl: account ${minter.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });

    it("should revert when updating cooldown by out-of-bounds index", async () => {
      await expect(
        superPass.connect(admin).updateCooldowns(5, 6 * days)
      ).revertedWith("Idx must be < maxBreedTimes");
    });
  });

  describe("Update drop rates for different classes when breeding", async () => {
    it("should update drop rates if caller is ADMIN", async () => {
      const parentClass = 1;
      const childClass = 2;
      let dropRate = 70;
      await superPass
        .connect(admin)
        .updateSamePVal(parentClass, childClass, dropRate);

      let prob = await superPass.sameClassProb(
        parentClass * maxClassIndex + childClass
      );
      expect(prob).deep.equal(dropRate);

      const matronClass = 0;
      const sireClass = 1;
      dropRate = 65;
      await superPass
        .connect(admin)
        .updateDiffPVal(matronClass, sireClass, dropRate);
      prob = await superPass.diffClassProb(
        matronClass * maxClassIndex + sireClass
      );
      expect(prob).deep.equal(dropRate);
    });

    it("should revert when updating drop rates if caller is NOT ADMIN", async () => {
      const parentClass = 1;
      const childClass = 2;
      let dropRate = 75;
      await expect(
        superPass
          .connect(minter)
          .updateSamePVal(parentClass, childClass, dropRate)
      ).revertedWith(
        `AccessControl: account ${minter.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      const matronClass = 0;
      const sireClass = 1;
      dropRate = 55;
      await expect(
        superPass
          .connect(minter)
          .updateDiffPVal(matronClass, sireClass, dropRate)
      ).revertedWith(
        `AccessControl: account ${minter.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });
  });

  describe("Config launchpad", async () => {
    it("should update max supply for launchpad if caller is ADMIN", async () => {
      const newUpdate = 81;
      await superPass.connect(admin).updateMaxLaunchpadSupply(newUpdate);

      const res = await superPass.launchpadMaxSupply();
      expect(res).deep.equal(newUpdate);
    });

    it("should revert when updating max supply for launchpad if caller is NOT ADMIN", async () => {
      await expect(
        superPass.connect(minter).updateMaxLaunchpadSupply(100)
      ).revertedWith(
        `AccessControl: account ${minter.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });

    it("should update launchpad address if caller is ADMIN", async () => {
      await superPass.connect(admin).updateLaunchpad(launchpad.address);

      const res = await superPass.launchpad();
      expect(res).deep.equal(launchpad.address);
    });

    it("should revert when updating launchpad address if caller is NOT ADMIN", async () => {
      await expect(
        superPass.connect(minter).updateLaunchpad(launchpad.address)
      ).revertedWith(
        `AccessControl: account ${minter.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });
  });

  describe("Mint super pass", async () => {
    it("should mint new super pass if caller is ADMIN", async () => {
      const matronId = 0;
      const sireId = 0;
      const superPassId = 1; // first pass

      const singerId = 1;
      const traits = randomTraits();
      const genes = encodeTraits(traits);
      const rarity = 2;
      const to = users[1].address;

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

    it("should revert when minting super pass if caller is NOT ADMIN/MINTER", async () => {
      const singerId = 1;
      const traits = randomTraits();
      const genes = encodeTraits(traits);
      const rarity = 1;
      const to = users[2].address;

      await expect(
        superPass.connect(users[2]).mintSingle(singerId, genes, rarity, to)
      ).revertedWith(
        `AccessControl: account ${users[2].address.toLowerCase()} is missing role ${minterRole}`
      );
    });
  });

  describe("Pause transferring and minting", async () => {
    it("should pause all trasfers if caller is ADMIN", async () => {
      const sender = users[1];
      const receiver = users[2];
      const tokenId = 1;

      // Try transferring
      await expect(
        superPass
          .connect(sender)
          .transferFrom(sender.address, receiver.address, tokenId)
      )
        .emit(superPass, "Transfer")
        .withArgs(sender.address, receiver.address, tokenId);

      // Admin pauses transferring
      await expect(superPass.connect(admin).pause())
        .emit(superPass, "Paused")
        .withArgs(admin.address);

      // Try transferring back
      await expect(
        superPass
          .connect(receiver)
          .transferFrom(receiver.address, sender.address, tokenId)
      ).revertedWith("NFT transfer while paused");
    });

    it("should disable minting when pausing if caller is ADMIN", async () => {
      const singerId = 1;
      const traits = randomTraits();
      const genes = encodeTraits(traits);
      const rarity = 2;
      const to = users[3].address;

      await expect(
        superPass.connect(admin).mintSingle(singerId, genes, rarity, to)
      ).revertedWith("Pausable: paused");
    });

    it("should revert when pausing if caller is NOT ADMIN", async () => {
      await expect(superPass.connect(minter).pause()).revertedWith(
        `AccessControl: account ${minter.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });
  });

  describe("Unpause transferring and minting", async () => {
    it("should upause all trasfers and minting if caller is ADMIN", async () => {
      const sender = users[2];
      const receiver = users[1];
      const tokenId = 1;

      // Admin unpauses transferring
      await expect(superPass.connect(admin).unpause())
        .emit(superPass, "Unpaused")
        .withArgs(admin.address);

      // Try transferring
      await expect(
        superPass
          .connect(sender)
          .transferFrom(sender.address, receiver.address, tokenId)
      )
        .emit(superPass, "Transfer")
        .withArgs(sender.address, receiver.address, tokenId);
    });

    it("should enable minting when unpausing if caller is ADMIN", async () => {
      const matronId = 0;
      const sireId = 0;
      const superPassId = 2; // second pass

      const singerId = 1;
      const traits = randomTraits();
      const genes = encodeTraits(traits);
      const rarity = 2;
      const to = users[3].address;

      await expect(
        superPass.connect(admin).mintSingle(singerId, genes, rarity, to)
      )
        .emit(superPass, "Birth")
        .withArgs(to, superPassId, matronId, sireId, singerId, genes, rarity);

      const totalSupply = await superPass.totalSupply();
      expect(totalSupply).deep.equal(2);

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

    it("should revert when unpausing if caller is NOT ADMIN", async () => {
      await expect(superPass.connect(minter).unpause()).revertedWith(
        `AccessControl: account ${minter.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });
  });

  describe("Grant minter role", async () => {
    it("should grant minter role if caller is ADMIN", async () => {
      const newMinter = users[5];
      await expect(
        superPass.connect(admin).grantRole(minterRole, newMinter.address)
      )
        .emit(superPass, "RoleGranted")
        .withArgs(minterRole, newMinter.address, admin.address);

      // Check if new minter is able to mint super pass
      const matronId = 0;
      const sireId = 0;
      const superPassId = 3; // third pass

      const singerId = 1;
      const traits = randomTraits();
      const genes = encodeTraits(traits);
      const rarity = 0;
      const to = users[1].address;

      await expect(
        superPass.connect(newMinter).mintSingle(singerId, genes, rarity, to)
      )
        .emit(superPass, "Birth")
        .withArgs(to, superPassId, matronId, sireId, singerId, genes, rarity);

      const totalSupply = await superPass.totalSupply();
      expect(totalSupply).deep.equal(3);

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
      expect(balance).deep.equal(2);

      const passId = await superPass.tokenOfOwnerByIndex(to, 1);
      expect(passId).deep.equal(superPassId);

      const passIdInStorage = await superPass.tokenOfOwnerByIndex(to, 1);
      expect(passIdInStorage).deep.equal(superPassId);
    });

    it("should revert when granting minter role if caller is NOT ADMIN", async () => {
      await expect(
        superPass.connect(users[3]).grantRole(minterRole, users[3].address)
      ).revertedWith(
        `AccessControl: account ${users[3].address.toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });
  });

  describe("Revoke minter role", async () => {
    it("should revoke minter role if caller is ADMIN", async () => {
      const target = users[5];
      await expect(
        superPass.connect(admin).revokeRole(minterRole, target.address)
      )
        .emit(superPass, "RoleRevoked")
        .withArgs(minterRole, target.address, admin.address);

      // Check if new minter is able to mint a new super pass
      const singerId = 1;
      const traits = randomTraits();
      const genes = encodeTraits(traits);
      const rarity = 1;
      const to = users[1].address;

      await expect(
        superPass.connect(target).mintSingle(singerId, genes, rarity, to)
      ).revertedWith(
        `AccessControl: account ${target.address.toLowerCase()} is missing role ${minterRole}`
      );
    });

    it("should revert when revoke minter role if caller is NOT ADMIN", async () => {
      await expect(
        superPass.connect(users[3]).grantRole(minterRole, minter.address)
      ).revertedWith(
        `AccessControl: account ${users[3].address.toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });
  });

  describe("Rescue lost super passes", async () => {
    it("should transfer a superpass owned by this contract to the specified address", async () => {
      const misleadingSender = users[1];
      let superPassId = await superPass.tokenOfOwnerByIndex(
        misleadingSender.address,
        1
      );

      const balanceBefore = await superPass.balanceOf(misleadingSender.address);

      // User do a misleading transfer to contract SuperPass
      await superPass
        .connect(misleadingSender)
        .transferFrom(misleadingSender.address, superPass.address, superPassId);

      const owner = await superPass.ownerOf(superPassId);
      expect(owner).deep.equal(superPass.address);

      const contractBalance = await superPass.balanceOf(superPass.address);
      expect(contractBalance).deep.equal(1);

      superPassId = await superPass.tokenOfOwnerByIndex(superPass.address, 0);

      // Rescue lost super pass
      await superPass
        .connect(admin)
        .rescueLostSuperPass(superPassId, misleadingSender.address);

      const currentBalance = await superPass.balanceOf(
        misleadingSender.address
      );
      expect(currentBalance).deep.equal(balanceBefore);

      const latestOwner = await superPass.ownerOf(superPassId);
      expect(latestOwner).deep.equal(misleadingSender.address);
    });

    it("should revert when transfer back the super pass that the contract does not own", async () => {
      const superPassId = 1;
      const owner = await superPass.ownerOf(superPassId);
      expect(owner).deep.equal(users[1].address);

      await expect(
        superPass
          .connect(admin)
          .rescueLostSuperPass(superPassId, users[3].address)
      ).revertedWith("Contract doesn't own this pass");
    });

    it("should revert when rescusing lost super pass if caller is not ADMIN", async () => {
      const superPassId = 1;
      const owner = await superPass.ownerOf(superPassId);
      expect(owner).deep.equal(users[1].address);

      await expect(
        superPass
          .connect(minter)
          .rescueLostSuperPass(superPassId, users[3].address)
      ).revertedWith(
        `AccessControl: account ${minter.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );
    });
  });
});
