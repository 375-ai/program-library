use crate::errors::ErrorCode;
use crate::events::UnclaimedWithdrawn;
use crate::state::{EpochAccount, RewardsAccount};
use anchor_lang::prelude::*;
use anchor_spl::token::{close_account, transfer, CloseAccount, Mint, Token, TokenAccount, Transfer};

/// Withdraw unclaimed tokens from an epoch after the withdrawal period expires.
/// 
/// This instruction allows the manager to reclaim tokens that remain unclaimed
/// after a specified time period. The epoch token account (ATA) is closed to
/// reclaim rent, but the epoch account itself remains for historical validation.
/// 
/// # Security features
/// - Only manager can call this instruction
/// - Tokens are returned to manager's wallet
/// - Requires configurable time period to elapse
/// - Closes empty token account to reclaim rent
/// 
/// # Arguments
/// * `epoch_nr` - The epoch number to withdraw tokens from
/// 
/// # Accounts
/// * `rewards_account` - The main program account
/// * `epoch_account` - The specific epoch account
/// * `manager` - The manager signer
/// * `epoch_token_account` - The epoch's ATA
/// * `manager_token_account` - Manager's ATA
/// * `mint_account` - The token mint
/// * `token_program` - SPL Token program
#[derive(Accounts)]
#[instruction(epoch_nr: u64)]
pub struct WithdrawUnclaimed<'info> {
    /// The [RewardsAccount] - validates manager authority
    #[account(mut, has_one = manager @ ErrorCode::Unauthorized)]
    pub rewards_account: Account<'info, RewardsAccount>,

    /// The [EpochAccount] - contains approval timestamp and token info
    #[account(mut,
        seeds = [
             b"EpochAccount".as_ref(),
             rewards_account.key().as_ref(),
             epoch_nr.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub epoch_account: Account<'info, EpochAccount>,

    /// Current manager of the program - only this account can withdraw tokens
    #[account(mut)]
    pub manager: Signer<'info>,

    /// Epoch token account (ATA) - contains unclaimed tokens, will be closed
    #[account(
        mut,
        associated_token::mint = mint_account,
        associated_token::authority = epoch_account,
    )]
    pub epoch_token_account: Account<'info, TokenAccount>,

    /// Manager's token account - receives the withdrawn tokens
    #[account(mut)]
    pub manager_token_account: Account<'info, TokenAccount>,

    /// The token mint account
    #[account(mut)]
    pub mint_account: Account<'info, Mint>,

    /// SPL Token program
    pub token_program: Program<'info, Token>,
}

/// Handler for withdrawing unclaimed tokens after the withdrawal period.
/// 
/// This function implements the core logic for token withdrawal with the following steps:
/// 1. Validates the manager has authority to withdraw
/// 2. Checks that sufficient time has elapsed since epoch approval
/// 3. Transfers remaining tokens to manager's wallet
/// 4. Closes the epoch token account to reclaim rent
/// 5. Emits event for transparency and monitoring
/// 
/// # Security validations
/// - Program must not be paused
/// - Epoch must be approved (tokens were distributed)
/// - Withdrawal period must have elapsed
/// - Must have tokens remaining to withdraw
/// - Only manager can execute (enforced by account constraints)
/// 
/// # Parameters
/// * `ctx` - The instruction context with all required accounts
/// * `epoch_nr` - The epoch number for validation
/// 
/// # Returns
/// * `Result<()>` - Success or specific error
pub fn withdraw_unclaimed_handler(
    ctx: Context<WithdrawUnclaimed>, 
    epoch_nr: u64
) -> Result<()> {
    let rewards_account = &ctx.accounts.rewards_account;
    let epoch_account = &ctx.accounts.epoch_account;
    
    // Validate program state
    require!(!rewards_account.is_paused, ErrorCode::ShouldNotBePaused);
    
    // Validate epoch state
    require!(epoch_account.is_approved, ErrorCode::EpochShouldBeApproved);
    
    // Calculate and validate withdrawal period using stored value
    let clock = Clock::get()?;
    let time_elapsed = clock.unix_timestamp - epoch_account.approved_at;
    let withdrawal_period_seconds = rewards_account.withdrawal_period_secs as i64;
    
    require!(
        time_elapsed >= withdrawal_period_seconds,
        ErrorCode::WithdrawalPeriodNotReached
    );

    // Validate there are tokens to withdraw
    let remaining_tokens = ctx.accounts.epoch_token_account.amount;
    require!(remaining_tokens > 0, ErrorCode::NoTokensToWithdraw);

    // Prepare PDA signing seeds for token operations
    let rewards_account_key = rewards_account.key();
    let seeds = [
        b"EpochAccount".as_ref(),
        rewards_account_key.as_ref(),
        &epoch_account.epoch_nr.to_le_bytes(),
        &[epoch_account.bump],
    ];

    // Step 1: Transfer remaining tokens to manager's wallet
    transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.epoch_token_account.to_account_info(),
                to: ctx.accounts.manager_token_account.to_account_info(),
                authority: epoch_account.to_account_info(),
            },
        )
        .with_signer(&[&seeds[..]]),
        remaining_tokens,
    )?;

    // Step 2: Close the epoch token account and return rent to manager
    close_account(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.epoch_token_account.to_account_info(),
                destination: ctx.accounts.manager.to_account_info(), // Rent goes to manager
                authority: epoch_account.to_account_info(),
            },
        )
        .with_signer(&[&seeds[..]]),
    )?;

    // Emit event for transparency and monitoring
    emit!(UnclaimedWithdrawn {
        epoch_nr,
        amount: remaining_tokens,
        withdrawn_to: ctx.accounts.manager.key(),
        withdrawn_at: clock.unix_timestamp,
    });

    Ok(())
}