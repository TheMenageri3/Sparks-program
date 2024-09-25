import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SparkProgram } from "../target/types/spark_program"; // Import SparkProgram type definition
import { LAMPORTS_PER_SOL, Connection, PublicKey } from '@solana/web3.js'; // Import necessary Solana utilities
import { assert } from "chai"; // Import assertion library for testing

// Utility function to introduce a delay (in milliseconds)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Function to fetch and return the balance of a given public key (account) in SOL
async function getAccountBalance(
  connection: Connection,
  pk: PublicKey
): Promise<number> {
  let amount = (await connection.getAccountInfo(pk)).lamports;
  return amount / LAMPORTS_PER_SOL;
}

/**
 * Confirms the transaction and waits for confirmation.
 */
const confirmTx = async (signature: string) => {
  const latestBlockhash = await anchor.getProvider().connection.getLatestBlockhash();
  await anchor.getProvider().connection.confirmTransaction({
    signature,
    ...latestBlockhash,
  });
  return signature;
};

/**
 * Logs the transaction signature with a link to the Solana Explorer.
 * Adds the custom RPC endpoint used for local or custom networks.
 */
const log = async (signature: string): Promise<string> => {
  console.log(
    `Your transaction signature: https://explorer.solana.com/transaction/${signature}?cluster=custom&customUrl=${anchor.getProvider().connection.rpcEndpoint}`
  );
  return signature.toString();
};

// Start of the testing suite for the Spark crowdfunding program
describe("Spark test", () => {
  // Configure the Anchor client to use the local Solana network.
  anchor.setProvider(anchor.AnchorProvider.env());

  // Define variables for the program and accounts
  const program = anchor.workspace.SparkProgram as Program<SparkProgram>; // Get reference to SparkProgram
  const creator = anchor.web3.Keypair.generate(); // Create a new keypair for the campaign creator
  const backer = anchor.web3.Keypair.generate(); // Create a new keypair for the backer
  const campaignSeed = new anchor.BN(Math.floor(Math.random() * 9000) + 1000); // Random seed for campaign
  const endingAt = new anchor.BN(Math.floor(Date.now() / 1000) + 60); // Set the campaign end time (60 seconds later)
  const fundingGoal = new anchor.BN(5); // Set the funding goal to 5 SOL
  const pledgeAmount = new anchor.BN(5); // Set the pledge amount to 5 SOL
  let campaign: PublicKey; // Store the campaign public key (to be derived)
  let backerData: PublicKey; // Store the backer data public key (to be derived)
  let campaignVault: PublicKey; // Store the campaign vault public key (to be derived)

  // Test to derive the program-derived addresses (PDAs) for the campaign, backer data, and vault
  it("Finds the PDAs and the Vault", async () => {
    console.log(endingAt.toString());

    // Derive the campaign PDA using the campaign seed and creator public key
    campaign = PublicKey.findProgramAddressSync(
      [
        anchor.utils.bytes.utf8.encode("campaign"),
        campaignSeed.toArrayLike(Buffer, "le", 8),
        creator.publicKey.toBuffer()
      ],
      program.programId
    )[0];

    // Derive the backer data PDA using the backer's public key and the campaign seed
    backerData = PublicKey.findProgramAddressSync(
      [
        anchor.utils.bytes.utf8.encode("backer-data"),
        backer.publicKey.toBuffer(),
        campaignSeed.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];

    // Derive the campaign vault, associated with the campaign
    campaignVault = PublicKey.findProgramAddressSync(
      [
        campaign.toBuffer()
      ],
      program.programId
    )[0];
  });

  // Test to airdrop SOL to both the creator and backer accounts
  it("Airdrops SOL to accounts", async () => {
    await Promise.all(
      [creator, backer].map(async (account) => {
        // Request an airdrop of 15 SOL to each account
        await anchor.getProvider().connection
          .requestAirdrop(account.publicKey, 15 * LAMPORTS_PER_SOL)
          .then(confirmTx);
      })
    );
  });

  // Test to create the campaign
  it("Creates the campaign", async () => {
    // Send a transaction to create a campaign
    const tx = await program.methods.createCampaign(campaignSeed, endingAt, fundingGoal)
      .accounts({ creator: creator.publicKey })
      .signers([creator])
      .rpc()
      .then(confirmTx)
      .then(log);

    console.log("Your transaction signature", tx);

    // Fetch the campaign account data and verify its contents
    const campaignFetched = await program.account.campaign.fetch(campaign);

    assert.equal(campaignFetched.campaignSeed.toString(), campaignSeed.toString(), `Campaign's seed should be ${campaignSeed.toString()}`);
    assert.equal(campaignFetched.creator.toString(), creator.publicKey.toString(), `Campaign's creator should be ${creator.publicKey.toString()}`);
    assert.equal(campaignFetched.endingAt.toString(), endingAt.toString(), `Campaign should end at ${endingAt.toString()}`);
    assert.equal(campaignFetched.fundingGoal.toString(), fundingGoal.toString(), `Campaign's funding goal should be ${fundingGoal.toString()}`);
    assert.equal(campaignFetched.isFinished, false);
  });

  // Test to pledge SOL to the campaign
  it("Pledges", async () => {
    // Send a transaction to pledge SOL to the campaign
    const tx = await program.methods.pledge(pledgeAmount)
      .accountsPartial({ backer: backer.publicKey, campaign: campaign })
      .signers([backer])
      .rpc()
      .then(confirmTx)
      .then(log);

    console.log("Your transaction signature", tx);

    // Verify that the campaign vault has received the pledged amount
    assert.equal((await getAccountBalance(anchor.getProvider().connection, campaignVault)).toString(), pledgeAmount.toString(), `Campaign should have received ${pledgeAmount.toString()} SOL`);

    // Fetch the backer data and verify the pledged amount
    const backerDataFetched = await program.account.backerData.fetch(backerData);
    assert.equal(backerDataFetched.backerAmount.toString(), pledgeAmount.toString(), `Backer's backed amount should be ${pledgeAmount.toString()} SOL`);
    assert.equal(backerDataFetched.backerPk.toString(), backer.publicKey.toString(), `Backer's public key should be ${backer.publicKey.toString()}`);
  });

  // Test to withdraw SOL from the campaign after the campaign has ended
  it("Withdraws", async () => {
    //Get the creator balance before withdraw
    const creatorBalance = await getAccountBalance(anchor.getProvider().connection, creator.publicKey)

    await delay(70000); // Wait for 70 seconds to simulate the campaign end
    // Send a transaction to withdraw the pledged SOL
    const tx = await program.methods.withdraw()
      .accountsPartial({ creator: creator.publicKey, campaign: campaign })
      .signers([creator])
      .rpc()
      .then(confirmTx)
      .then(log);

    console.log("Your transaction signature", tx);
  });
});
