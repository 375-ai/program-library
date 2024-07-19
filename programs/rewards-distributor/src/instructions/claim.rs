use crate::errors::ErrorCode;
use crate::events::ClaimedEvent;
use crate::state::{ClaimStatus, RewardsAccount, RewardsDistributor};
use crate::utils::merkle_proof;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount};

/// [rewards_distributor::claim] accounts.
#[derive(Accounts)]
#[instruction( index: u64)]
pub struct Claim<'info> {
    #[account(mut)]
    pub rewards_account: Account<'info, RewardsAccount>,

    /// The [RewardsDistributor].
    #[account(
        mut,
        address = from.owner
    )]
    pub distributor: Account<'info, RewardsDistributor>,

    /// Status of the claim.
    #[account(
        init,
        seeds = [
            b"ClaimStatus".as_ref(),
            index.to_le_bytes().as_ref(),
            distributor.key().to_bytes().as_ref()
        ],
        bump,
        space = 8 + ClaimStatus::LEN,
        payer = payer
    )]
    pub claim_status: Account<'info, ClaimStatus>,

    /// Distributor ATA containing the tokens to distribute.
    #[account(mut)]
    pub from: Account<'info, TokenAccount>,

    /// Account to send the claimed tokens to.
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,

    /// Who is claiming the tokens.
    #[account(address = to.owner @ ErrorCode::OwnerMismatch)]
    pub receiver: Signer<'info>,

    /// Payer of the claim.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The [System] program.
    pub system_program: Program<'info, System>,

    /// SPL [Token] program.
    pub token_program: Program<'info, Token>,
}

/// claim handler.
pub fn claim_handler(
    ctx: Context<Claim>,
    index: u64,
    amount: u64,
    proof: Vec<[u8; 32]>,
) -> Result<()> {
    let rewards_account = &mut ctx.accounts.rewards_account;
    require!(!rewards_account.is_paused, ErrorCode::ShouldNotBePaused);

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
    let distributor = &ctx.accounts.distributor;

    // Ensure the receiver account is the signer.
    require!(receiver_account.is_signer, ErrorCode::Unauthorized);

    // Verify the merkle proof.
    let node = anchor_lang::solana_program::keccak::hashv(&[
        &index.to_le_bytes(),
        &receiver_account.key().to_bytes(),
        &amount.to_le_bytes(),
    ]);
    require!(
        merkle_proof::verify(proof, distributor.root, node.0),
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
    let seeds = [
        b"RewardsDistributor".as_ref(),
        &distributor.base.to_bytes(),
        &[ctx.accounts.distributor.bump],
    ];

    // Invoke the transfer instruction on the token program
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.from.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: ctx.accounts.distributor.to_account_info(),
            },
        )
        .with_signer(&[&seeds[..]]),
        amount,
    )?;

    // Update the distributor's total amount claimed and number of nodes claimed.
    let distributor = &mut ctx.accounts.distributor;
    distributor.total_amount_claimed = distributor.total_amount_claimed + amount;

    // Emit an event indicating that the claim has been made.
    emit!(ClaimedEvent {
        index,
        receiver: receiver_account.key(),
        amount
    });

    Ok(())
}
