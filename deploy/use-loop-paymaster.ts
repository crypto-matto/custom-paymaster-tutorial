import { Provider, utils, Wallet } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import dotenv from "dotenv";
dotenv.config();

// Put the address of the deployed paymaster here
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS || "";

const LOOP_CONTRACT_ADDRESS = process.env.LOOP_CONTRACT_ADDRESS || "";

// Wallet private key
const EMPTY_WALLET_PRIVATE_KEY = process.env.EMPTY_WALLET_PRIVATE_KEY || "";

function getLoop(hre: HardhatRuntimeEnvironment, wallet: Wallet) {
  const artifact = hre.artifacts.readArtifactSync("TestLoop");
  return new ethers.Contract(LOOP_CONTRACT_ADDRESS, artifact.abi, wallet);
}

export default async function (hre: HardhatRuntimeEnvironment) {
  const provider = new Provider(hre.userConfig.networks?.zkSyncLocalTestnet?.url);
  const emptyWallet = new Wallet(EMPTY_WALLET_PRIVATE_KEY, provider);

  // Obviously this step is not required, but it is here purely to demonstrate that indeed the wallet has no ether.
  const ethBalance = await emptyWallet.getBalance();

  console.log(`Empty wallet's address: ${emptyWallet.address}`);
  console.log(
    `ETH balance of the empty wallet before mint: ${await emptyWallet.getBalance()} ETH`
  );

  if (!ethBalance.eq(0)) {
    throw new Error("The wallet is not empty!");
  }

  let paymasterBalance = await provider.getBalance(PAYMASTER_ADDRESS);
  console.log(`Paymaster ETH balance is ${ethers.utils.formatEther(paymasterBalance.toString())} ETH`);

  const loop = getLoop(hre, emptyWallet);

  const gasPrice = await provider.getGasPrice();

  const paymasterParams = utils.getPaymasterParams(PAYMASTER_ADDRESS, {
    type: "General",
    innerInput: new TextEncoder().encode("")
  });

  // Estimate gas fee for loop transaction
  // const gasLimit = await loop.estimateGas.loop({
  //   customData: {
  //     gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
  //     paymasterParams: paymasterParams,
  //   },
  // });
  const gasLimit = 100_000_000;

  const fee = gasPrice.mul(gasLimit.toString());
  console.log("Transaction fee estimation is :>> ", ethers.utils.formatEther(fee.toString()), "ETH");

  // await loop.setName("Reset", {
  //   customData: {
  //     paymasterParams: paymasterParams,
  //     gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
  //   },
  // });

  // await loop.setLoopMax(4000, {
  //   customData: {
  //       paymasterParams: paymasterParams,
  //       gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
  //     },
  // });

  await (
    await loop.loop({
      // paymaster info
      customData: {
        paymasterParams: paymasterParams,
        gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
      },
    })
  ).wait();

  console.log("Name:", await loop.name());
  console.log("Loop Max:", ethers.BigNumber.from(await loop.loopMax()).toString());

  paymasterBalance = await provider.getBalance(PAYMASTER_ADDRESS);
  console.log(`Paymaster ETH balance is now ${ethers.utils.formatEther(
    paymasterBalance.toString()
  )} ETH`);

  console.log(
    `ETH balance of the empty wallet after mint: ${await emptyWallet.getBalance()}`
  );
}
