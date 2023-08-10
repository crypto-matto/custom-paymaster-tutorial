import { Provider, utils, Wallet } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import dotenv from "dotenv";
dotenv.config();

// Put the address of the deployed paymaster here
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS || "";

// Put the address of the ERC20 token here:
const GLD_TOKEN_ADDRESS = process.env.GLD_TOKEN_ADDRESS || "";
const GLD2_TOKEN_ADDRESS = process.env.GLD2_TOKEN_ADDRESS || "";
const WETH_TOKEN_ADDRESS = process.env.WETH_TOKEN_ADDRESS || "";
const UNISWAP_V2_ROUTER02_ADDRESS = process.env.UNISWAP_V2_ROUTER02_ADDRESS || "";

const EMPTY_WALLET_PRIVATE_KEY = process.env.EMPTY_WALLET_PRIVATE_KEY || "";

function getGLDToken(hre: HardhatRuntimeEnvironment, wallet: Wallet) {
  const artifact = hre.artifacts.readArtifactSync("GLDToken");
  return new ethers.Contract(GLD_TOKEN_ADDRESS, artifact.abi, wallet);
}

function getGLD2Token(hre: HardhatRuntimeEnvironment, wallet: Wallet) {
  const artifact = hre.artifacts.readArtifactSync("GLDToken");
  return new ethers.Contract(GLD2_TOKEN_ADDRESS, artifact.abi, wallet);
}

function getWETH9Token(hre: HardhatRuntimeEnvironment, wallet: Wallet) {
  const artifact = hre.artifacts.readArtifactSync("WETH9");
  return new ethers.Contract(WETH_TOKEN_ADDRESS, artifact.abi, wallet);
}

function getUniswapV2Router02(hre: HardhatRuntimeEnvironment, wallet: Wallet) {
  const artifact = hre.artifacts.readArtifactSync("contracts/uniswap/UniswapV2Router02.sol:UniswapV2Router02");
  return new ethers.Contract(UNISWAP_V2_ROUTER02_ADDRESS, artifact.abi, wallet);
}

export default async function (hre: HardhatRuntimeEnvironment) {
  const provider = new Provider(hre.config.networks?.zkSyncLocalTestnet?.url);
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

  console.log(
    `GLD token balance of the empty wallet before mint: ${await emptyWallet.getBalance(GLD_TOKEN_ADDRESS)}`
  );

  console.log(
    `GLD2 token balance of the empty wallet before mint: ${await emptyWallet.getBalance(GLD2_TOKEN_ADDRESS)}`
  );

  console.log(
    `WETH9 token balance of the empty wallet before mint: ${await emptyWallet.getBalance(WETH_TOKEN_ADDRESS)}`
  );

  let paymasterBalance = await provider.getBalance(PAYMASTER_ADDRESS);
  console.log(`Paymaster ETH balance is ${ethers.utils.formatEther(paymasterBalance.toString())} ETH`);

  const GLDToken = getGLDToken(hre, emptyWallet);
  const GLD2Token = getGLD2Token(hre, emptyWallet);
  const WETH9Token = getWETH9Token(hre, emptyWallet);
  const uniswapContract = getUniswapV2Router02(hre, emptyWallet);

  const gasPrice = await provider.getGasPrice();

  // Encoding the "General" paymaster flow's input
  const paymasterParams = utils.getPaymasterParams(PAYMASTER_ADDRESS, {
    type: "General",
    innerInput: new Uint8Array(),
  });
  
  // Estimate gas fee for swapETHForExactTokens transaction
  // const gasLimit = await uniswapContract.estimateGas.swapETHForExactTokens(
  //   10000, 
  //   [WETH_TOKEN_ADDRESS, GLD_TOKEN_ADDRESS],
  //   emptyWallet.address,
  //   Math.round(Date.now() / 1000) + 10 * 60,
  //   {
  //     customData: {
  //       gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT * 4,
  //       paymasterParams: paymasterParams,
  //     },
  //   }
  // );

  // Estimate gas fee for swapExactTokensForETH transaction
  const gasLimit = await uniswapContract.estimateGas.swapExactTokensForETH(
    ethers.BigNumber.from('10000000000000000000000'),
    ethers.BigNumber.from('996999'),
    // 100000, 
    [GLD_TOKEN_ADDRESS, WETH_TOKEN_ADDRESS],
    emptyWallet.address,
    Math.round(Date.now() / 1000) + 10 * 60,
    {
      customData: {
        gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
        paymasterParams: paymasterParams,
      },
    }
  );

  const fee = gasPrice.mul(gasLimit.toString());
  console.log("Transaction fee estimation is :>> ", ethers.utils.formatEther(fee.toString()), "ETH");

  console.log(`Swaping 5 GLD Tokens for empty wallet via paymaster...`);
  await (
    // await uniswapContract.swapETHForExactTokens(
    //   5, 
    //   [WETH_TOKEN_ADDRESS, GLD_TOKEN_ADDRESS],
    //   emptyWallet.address,
    //   Math.round(Date.now() / 1000) + 10 * 60,
    //   {
    //     customData: {
    //       gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
    //       paymasterParams: paymasterParams,
    //     },
    //   }
    // )

    await uniswapContract.estimateGas.swapExactTokensForETH(
      100000,
      0, 
      [GLD_TOKEN_ADDRESS, WETH_TOKEN_ADDRESS],
      emptyWallet.address,
      Math.round(Date.now() / 1000) + 10 * 60,
      {
        customData: {
          gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT * 4,
          paymasterParams: paymasterParams,
        },
      }
    )
  // ).wait();
  );

  console.log(
    `Paymaster GLD token balance is now ${
      await GLDToken.balanceOf(PAYMASTER_ADDRESS)
    }`
  );

  paymasterBalance = await provider.getBalance(PAYMASTER_ADDRESS);
  console.log(`Paymaster ETH balance is now ${ethers.utils.formatEther(
    paymasterBalance.toString()
  )} ETH`);

  console.log(
    `ETH balance of the empty wallet after mint: ${await emptyWallet.getBalance()}`
  );

  console.log(
    `GLD token balance of the empty wallet after mint: ${await emptyWallet.getBalance(GLD_TOKEN_ADDRESS)}`
  );

  console.log(
    `GLD2 token balance of the empty wallet after mint: ${await emptyWallet.getBalance(GLD2_TOKEN_ADDRESS)}`
  );

  console.log(
    `WETH token balance of the empty wallet after mint: ${await emptyWallet.getBalance(WETH_TOKEN_ADDRESS)}`
  );
}
