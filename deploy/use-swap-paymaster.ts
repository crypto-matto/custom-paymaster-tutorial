import { Provider, utils, Wallet } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import dotenv from "dotenv";
dotenv.config();

// Put the address of the deployed paymaster here
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS || "";
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY || "";

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
  const richWallet = new Wallet(WALLET_PRIVATE_KEY, provider);
  const emptyWallet = new Wallet(EMPTY_WALLET_PRIVATE_KEY, provider);
  console.log("----------------------- before swap -----------------------")
  console.log(`[empty wallet] address: ${emptyWallet.address}`);
  const emptyWalletEthBalanceBefore = await provider.getBalance(emptyWallet.address);
  const emptyWalletGld2BalanceBefore = await emptyWallet.getBalance(GLD2_TOKEN_ADDRESS);

  printBalance("empty wallet", "ETH", emptyWalletEthBalanceBefore);
  printBalance("empty wallet", "GLD2", emptyWalletGld2BalanceBefore);

  let GLDToken = getGLDToken(hre, richWallet);
  let router = getUniswapV2Router02(hre, emptyWallet);

  // fund some gld token for swap
  let emptyWalletGldBalanceBefore = await GLDToken.balanceOf(emptyWallet.address);
  if (emptyWalletGldBalanceBefore.lte(ethers.utils.parseEther("100000"))) {
    await (
      await GLDToken.transfer(emptyWallet.address, ethers.utils.parseEther("1000000"))
    ).wait()
    emptyWalletGldBalanceBefore = await GLDToken.balanceOf(emptyWallet.address);
  }
  printBalance("empty wallet", "GLD", emptyWalletGldBalanceBefore);

  let paymasterBalanceBefore = await provider.getBalance(PAYMASTER_ADDRESS);
  if (paymasterBalanceBefore.lte(ethers.utils.parseEther("10"))) {
    await (
      await richWallet.transfer({
        to: PAYMASTER_ADDRESS,
        amount: ethers.utils.parseEther("10"),
      })
    ).wait();
  }
  printBalance("paymaster", "ETH", paymasterBalanceBefore);

  // Encoding the "General" paymaster flow's input
  const paymasterParams = utils.getPaymasterParams(PAYMASTER_ADDRESS, {
    type: "General",
    innerInput: new Uint8Array(),
  });

  GLDToken = GLDToken.connect(emptyWallet);
  await(
    await GLDToken.approve(UNISWAP_V2_ROUTER02_ADDRESS, ethers.constants.MaxUint256, {
      customData: {
        gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT * 4,
        paymasterParams: paymasterParams, 
      }
    })
  ).wait();

  console.log(`Swaping 1 GLD for GLD2 via paymaster...`);
  await (
    await router.swapExactTokensForTokens(
      ethers.utils.parseEther("1"),
      0, 
      [GLD_TOKEN_ADDRESS, GLD2_TOKEN_ADDRESS],
      emptyWallet.address,
      Math.round(Date.now() / 1000) + 10 * 60,
      {
        customData: {
          gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT * 4,
          paymasterParams: paymasterParams,
        },
      }
    )
  ).wait();

  console.log("----------------------- after swap -----------------------");

  let paymasterBalance = await provider.getBalance(PAYMASTER_ADDRESS);
  printBalanceChanges("paymaster", "ETH", paymasterBalanceBefore, paymasterBalance);

  const emptyWalletEthBalance = await provider.getBalance(emptyWallet.address);
  const emptyWalletGldBalance = await emptyWallet.getBalance(GLD_TOKEN_ADDRESS);
  const emptyWalletGld2Balance = await emptyWallet.getBalance(GLD2_TOKEN_ADDRESS);

  printBalanceChanges("empty wallet", "ETH", emptyWalletEthBalanceBefore, emptyWalletEthBalance);
  printBalanceChanges("empty wallet", "GLD", emptyWalletGldBalanceBefore, emptyWalletGldBalance);
  printBalanceChanges("empty wallet", "GLD2", emptyWalletGld2BalanceBefore, emptyWalletGld2Balance);
}

function printBalance(walletName: string, tokenName: string, balance: ethers.BigNumber) {
  console.log(
    `[${walletName}] ${tokenName} balance: ${ethers.utils.formatEther(balance)}`
  );
}

function printBalanceChanges(walletName: string, tokenName: string, balanceBefore: ethers.BigNumber, balanceAfter: ethers.BigNumber) {
  if (balanceBefore.eq(balanceAfter)) {
    console.log(
      `[${walletName}] ${tokenName} balance: ${ethers.utils.formatEther(balanceAfter)}, balance didn't change`
    );
  }

  if (balanceBefore.gt(balanceAfter)) {
    console.log(
      `[${walletName}] ${tokenName} balance: ${balanceAfter}, decreased by ${ethers.utils.formatEther(balanceBefore.sub(balanceAfter))}`
    );
  }

  if (balanceBefore.lt(balanceAfter)) {
    console.log(
      `[${walletName}] ${tokenName} balance: ${balanceAfter}, increased by ${ethers.utils.formatEther(balanceAfter.sub(balanceBefore))}`
    );
  }
}