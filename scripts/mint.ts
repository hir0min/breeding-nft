import { ethers } from "hardhat";
import { BigNumber, utils } from "ethers";

const encodeTraits = (traits: number[]) => {
  let genes = BigNumber.from(0);
  for (let i = 0; i < 7; i++) genes = genes.shl(5).or(traits[6 - i]);
  return genes;
};

const randomTraits = () => {
  return Array.from({ length: 7 }, () => Math.floor(Math.random() * 4));
};

async function main() {
  const superPass = await ethers.getContractAt(
    "SuperPass",
    "0x25Fac8564d4c99f6F8eee06931CC30f8a36Dc289"
  );

  const to = "0x62092EB9EC103e12fd26Afa194f652C971F1F435";

  // mint busd and sing to pay breeding fee
  const balance = BigNumber.from(utils.parseEther("1000000000000"));
  const busd = await ethers.getContractAt(
    "ERC20Test",
    "0xd243Bcd50A5217E1fbF59548aB881CBB3A0f67F1"
  );

  const sing = await ethers.getContractAt(
    "ERC20Test",
    "0x15f80f7A610a3403a5CC7D4C743B35eF4837Bad6"
  );

  await busd.mint(to, balance);
  await sing.mint(to, balance);

  for (let i = 0; i < 12; i++) {
    const singerId = i % 3;
    const genes = encodeTraits(randomTraits());
    const rarity = i % 3;
    await superPass.mintSingle(singerId, genes, rarity, to, {
      gasLimit: 500000,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
