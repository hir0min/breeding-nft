import { expect } from "chai";
import { ethers } from "hardhat";
import { GeneScienceTest } from "../typechain";
import { BigNumber } from "ethers";

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

describe("Gene Science tests", async () => {
  let geneSciece: GeneScienceTest;

  before(async () => {
    const geneScieceFactory = await ethers.getContractFactory(
      "GeneScienceTest"
    );
    geneSciece = await geneScieceFactory.deploy();
  });

  it("should encode traits into gene", async () => {
    const traits = randomTraits();
    const targetGene = encodeTraits(traits);

    const gene = await geneSciece.encode(traits);
    expect(gene).deep.equal(targetGene);
  });

  it("should decode gene into traits", async () => {
    const traits = randomTraits();
    const targetGene = encodeTraits(traits);

    const gene = await geneSciece.encode(traits);
    expect(gene).deep.equal(targetGene);

    const decodedTraits = await geneSciece.decode(gene);
    for (let i = 0; i < decodedTraits.length; i++)
      expect(decodedTraits[i]).deep.equal(traits[i]);
  });

  describe("Mix 2 traits into ascended trait", async () => {
    it("should mutate 2 traits into ascended", async () => {
      let trait1 = 0;
      let trait2 = 1;
      let rand = 1;

      let ascendedTrait = await geneSciece.ascend(trait1, trait2, rand);
      expect(ascendedTrait).deep.equal(4);

      trait1 = 2;
      trait2 = 3;
      rand = 1;

      ascendedTrait = await geneSciece.ascend(trait1, trait2, rand);
      expect(ascendedTrait).deep.equal(5);

      trait1 = 4;
      trait2 = 5;
      rand = 1;

      ascendedTrait = await geneSciece.ascend(trait1, trait2, rand);
      expect(ascendedTrait).deep.equal(6);
    });

    it("should return empty trait when random is not in evolving range", async () => {
      let trait1 = 0;
      let trait2 = 1;
      let rand = 3;

      let ascendedTrait = await geneSciece.ascend(trait1, trait2, rand);
      expect(ascendedTrait).deep.equal(0);

      trait1 = 2;
      trait2 = 3;
      rand = 5;

      ascendedTrait = await geneSciece.ascend(trait1, trait2, rand);
      expect(ascendedTrait).deep.equal(0);

      trait1 = 4;
      trait2 = 5;
      rand = 7;

      ascendedTrait = await geneSciece.ascend(trait1, trait2, rand);
      expect(ascendedTrait).deep.equal(0);
    });

    it("should return empty traits when they do not match for evolving", async () => {
      let trait1 = 0;
      let trait2 = 2;
      let rand = 3;

      let ascendedTrait = await geneSciece.ascend(trait1, trait2, rand);
      expect(ascendedTrait).deep.equal(0);

      trait1 = 1;
      trait2 = 2;
      rand = 1;

      ascendedTrait = await geneSciece.ascend(trait1, trait2, rand);
      expect(ascendedTrait).deep.equal(0);

      trait1 = 4;
      trait2 = 0;
      rand = 5;

      ascendedTrait = await geneSciece.ascend(trait1, trait2, rand);
      expect(ascendedTrait).deep.equal(0);
    });
  });

  it("should mix 2 genes into ascended gene", async () => {
    let traits1 = [0, 3, 1, 2, 3, 2, 1];
    let traits2 = [1, 2, 0, 2, 2, 3, 3];

    let genes1 = encodeTraits(traits1);
    let genes2 = encodeTraits(traits2);
    let random = 1234567899;

    // const contractRand = BigNumber.from(
    //   ethers.utils.keccak256(
    //     ethers.utils.solidityPack(
    //       ["uint256", "uint256", "uint256"],
    //       [random, genes1, genes2]
    //     )
    //   )
    // );
    // Result : ... 1011011110101(0 100) (0 011) (0 010) (1) (1 011) (001) (001)
    // Expected traits           :   1       2       3     2     0      5     4

    let ascendedGenes = await geneSciece.mixGenes(genes1, genes2, random);
    let decodedTraits = decodeGenes(ascendedGenes);
    expect(decodedTraits[0]).deep.equal(4);
    expect(decodedTraits[1]).deep.equal(5);
    expect(decodedTraits[2]).deep.equal(0);
    expect(decodedTraits[3]).deep.equal(2);
    expect(decodedTraits[4]).deep.equal(3);
    expect(decodedTraits[5]).deep.equal(2);
    expect(decodedTraits[6]).deep.equal(1);

    traits1 = [4, 5, 1, 4, 3, 2, 1];
    traits2 = [5, 4, 0, 5, 2, 3, 3];

    genes1 = encodeTraits(traits1);
    genes2 = encodeTraits(traits2);
    random = 999999999;

    // const contractRand = BigNumber.from(
    //   ethers.utils.keccak256(
    //     ethers.utils.solidityPack(
    //       ["uint256", "uint256", "uint256"],
    //       [random, genes1, genes2]
    //     )
    //   )
    // );
    // Result : ... 0100010110010010(1) (0110) (001) (0 100) (1 101) (1 100) (000)
    // Expected traits           :    3     2     5      4       0       4      6

    ascendedGenes = await geneSciece.mixGenes(genes1, genes2, random);
    decodedTraits = decodeGenes(ascendedGenes);
    expect(decodedTraits[0]).deep.equal(6);
    expect(decodedTraits[1]).deep.equal(4);
    expect(decodedTraits[2]).deep.equal(0);
    expect(decodedTraits[3]).deep.equal(4);
    expect(decodedTraits[4]).deep.equal(5);
    expect(decodedTraits[5]).deep.equal(2);
    expect(decodedTraits[6]).deep.equal(3);
  });
});
