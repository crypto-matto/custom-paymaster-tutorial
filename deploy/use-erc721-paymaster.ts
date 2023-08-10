import { Provider, utils, Wallet } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import dotenv from "dotenv";
dotenv.config();

// Put the address of the deployed paymaster here
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS || "";

// Put the address of the NFT ERC721 token here:
const ERC721_TOKEN_ADDRESS = process.env.ERC721_TOKEN_ADDRESS || "";

// Wallet private key
const EMPTY_WALLET_PRIVATE_KEY = process.env.EMPTY_WALLET_PRIVATE_KEY || "";

function getToken(hre: HardhatRuntimeEnvironment, wallet: Wallet) {
  const artifact = hre.artifacts.readArtifactSync("InfinityStones");
  return new ethers.Contract(ERC721_TOKEN_ADDRESS, artifact.abi, wallet);
}

export default async function (hre: HardhatRuntimeEnvironment) {
  const provider = new Provider(hre.userConfig.networks?.zkSyncLocalTestnet?.url);
  const emptyWallet = new Wallet(EMPTY_WALLET_PRIVATE_KEY, provider);

  // Obviously this step is not required, but it is here purely to demonstrate that indeed the wallet has no ether.
  const ethBalance = await emptyWallet.getBalance();

  console.log(`Empty wallet's address: ${emptyWallet.address}`);
  console.log(
    `ETH balance of the empty wallet before mint: ${await emptyWallet.getBalance()}`
  );

  if (!ethBalance.eq(0)) {
    throw new Error("The wallet is not empty!");
  }

  let paymasterBalance = await provider.getBalance(PAYMASTER_ADDRESS);
  console.log(`Paymaster ETH balance is ${ethers.utils.formatEther(paymasterBalance.toString())} ETH`);

  const erc721 = getToken(hre, emptyWallet);

  const balance = await erc721.balanceOf(emptyWallet.address);
  console.log(`ERC721 token balance of the recipient: ${balance}`);

  const gasPrice = await provider.getGasPrice();

  // Encoding the "General" paymaster flow's input
  const paymasterParams = utils.getPaymasterParams(PAYMASTER_ADDRESS, {
    type: "General",
    innerInput: new TextEncoder().encode("")
  });
  
  // Estimate gas fee for mint transaction
      const gasLimit = await erc721.estimateGas.mint(
        emptyWallet.address,
        "Time Stone",
        {
            customData: {
            gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
            paymasterParams: paymasterParams,
            },
      });

  // const gasLimit = await erc721.estimateGas.setBaseURI(
  //   "https://ipfs.io/ipfs/QmPtDtJEJDzxthbKmdgvYcLa9oNUUUkh7vvz5imJFPQdKa",
  //   {
  //       customData: {
  //       gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
  //       paymasterParams: paymasterParams,
  //       },
  // })

  const fee = gasPrice.mul(gasLimit.toString());
  console.log("Transaction fee estimation is :>> ", ethers.utils.formatEther(fee.toString()), "ETH");

  console.log(`Minting ERC721 token From empty wallet via paymaster...`);

  await (
    await erc721.mint(
      emptyWallet.address,
        "Time Stone",
        {
            customData: {
            gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
            paymasterParams: paymasterParams,
            },
      })

      // Update base URI

    // await erc721.setBaseURI(
    //     "https://ipfs.io/ipfs/QmPtDtJEJDzxthbKmdgvYcLa9oNUUUkh7vvz5imJFPQdKa",
    //     {
    //         customData: {
    //         gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
    //         paymasterParams: paymasterParams,
    //         },
    //   })
  ).wait();
  // console.log(`New baseURI is ${await erc721.baseURI()}`);

  console.log(
    `Paymaster ERC721 token balance is now ${
      await erc721.balanceOf(PAYMASTER_ADDRESS)
    }`
  );

  console.log(
    `Empty Wallet ERC721 token balance is now ${
      await erc721.balanceOf(emptyWallet.address)
    }`
  );

  // console.log(
  //   `Destination ERC721 token balance is now ${
  //     await erc721.balanceOf("0x52F43E59A6e5c645a7a9C23a6c22a0f82378bed9")
  //   }`
  // );

  paymasterBalance = await provider.getBalance(PAYMASTER_ADDRESS);
  console.log(`Paymaster ETH balance is now ${ethers.utils.formatEther(
    paymasterBalance.toString()
  )} ETH`);

  console.log(
    `ETH balance of the empty wallet after mint: ${ethers.utils.formatEther(await emptyWallet.getBalance())} ETH`
  );

//   console.log(
//     `ERC20 token balance of the empty wallet after mint: ${await emptyWallet.getBalance(ERC20_TOKEN_ADDRESS)}`
//   );
}
