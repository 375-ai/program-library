use crate::errors::ErrorCode;
use crate::events::ClaimedEvent;
use crate::state::{ClaimStatus, EpochAccount, RewardsAccount};
use crate::utils::merkle_proof;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

/// [rewards_distributor::claim] accounts.
#[derive(Accounts)]
#[instruction(index: u64)]
pub struct Claim<'info> {
    /// The [RewardsAccount].
    #[account(mut)]
    pub rewards_account: Account<'info, RewardsAccount>,

    /// The [EpochAccount].
    #[account(mut,
        address = from.owner
    )]
    pub epoch_account: Account<'info, EpochAccount>,

    /// Status of the claim.
    #[account(
        init,
        seeds = [
            b"ClaimStatus".as_ref(),
            rewards_account.key().as_ref(),
            index.to_le_bytes().as_ref(),
            epoch_account.key().to_bytes().as_ref()
        ],
        bump,
        space = 8 + ClaimStatus::LEN,
        payer = receiver
    )]
    pub claim_status: Account<'info, ClaimStatus>,

    /// Distributor ATA containing the tokens to distribute.
    #[account(mut)]
    pub from: Account<'info, TokenAccount>,

    // Account to send the claimed tokens to.
    #[account(
        init_if_needed,
        payer = receiver,
        associated_token::mint = mint_account,
        associated_token::authority = receiver,
        associated_token::token_program = token_program
    )]
    pub to: Account<'info, TokenAccount>,

    /// Who is claiming the tokens.
    #[account(mut, address = to.owner @ ErrorCode::OwnerMismatch)]
    pub receiver: Signer<'info>,

    #[account(mut)]
    pub mint_account: Account<'info, Mint>,

    /// SPL [Token] program.
    pub token_program: Program<'info, Token>,

    /// Associated [Token] program.
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// The [System] program.
    pub system_program: Program<'info, System>,
}

/// claim handler.
pub fn claim_handler(
    ctx: Context<Claim>,
    index: u64,
    amount: u64,
    proof: Vec<[u8; 32]>,
) -> Result<()> {
    let rewards_account = &ctx.accounts.rewards_account;
    require!(!rewards_account.is_paused, ErrorCode::ShouldNotBePaused);

    let epoch_account = &mut ctx.accounts.epoch_account;
    require!(epoch_account.is_approved, ErrorCode::EpochShouldBeApproved);
    require!(
        epoch_account.mint == ctx.accounts.mint_account.key(),
        ErrorCode::InvalidMintAccount
    );

    let epoch_root = epoch_account.hash;

    // Ensure the `from` and `to` accounts are different.
    require_keys_neq!(ctx.accounts.from.key(), ctx.accounts.to.key());

    // Get a mutable reference to the claim status account.
    let claim_status = &mut ctx.accounts.claim_status;
    require!(
        // This check is redundant, we should not be able to initialize a claim status account at the same key.
        !claim_status.is_claimed && claim_status.claimed_at == 0,
        ErrorCode::DropAlreadyClaimed
    );

    // Get references to the receiver account and the distributor account.
    let receiver_account = &ctx.accounts.receiver;

    // Ensure the receiver account is the signer.
    require!(receiver_account.is_signer, ErrorCode::Unauthorized);

    // Verify the merkle proof.
    let node = anchor_lang::solana_program::keccak::hashv(&[
        &index.to_le_bytes(),
        &receiver_account.key().to_bytes(),
        &amount.to_le_bytes(),
    ]);
    require!(
        merkle_proof::verify(proof, epoch_root, node.0),
        ErrorCode::InvalidProof
    );

    // Mark it claimed and send the tokens.
    claim_status.amount = amount;
    claim_status.is_claimed = true;
    let clock = Clock::get()?;
    claim_status.claimed_at = clock.unix_timestamp;
    claim_status.receiver = receiver_account.key();

    // Ensure the owner of the `to` account matches the receiver's public key.
    require_keys_eq!(
        ctx.accounts.to.owner,
        receiver_account.key(),
        ErrorCode::OwnerMismatch
    );

    // Define the seeds for signing the transaction.
    let rewards_account_key = rewards_account.key();
    let seeds = [
        b"EpochAccount".as_ref(),
        rewards_account_key.as_ref(),
        &epoch_account.epoch_nr.to_le_bytes(),
        &[epoch_account.bump],
    ];

    // Invoke the transfer instruction on the token program
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.from.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: epoch_account.to_account_info(),
            },
        )
        .with_signer(&[&seeds[..]]),
        amount,
    )?;

    // Update the distributor's total amount claimed and number of nodes claimed.
    epoch_account.total_amount_claimed = epoch_account.total_amount_claimed + amount;
    epoch_account.num_nodes_claimed += 1;

    // Emit an event indicating that the claim has been made.
    emit!(ClaimedEvent {
        index,
        receiver: receiver_account.key(),
        amount,
        epoch_nr: epoch_account.epoch_nr
    });

    Ok(())
}
