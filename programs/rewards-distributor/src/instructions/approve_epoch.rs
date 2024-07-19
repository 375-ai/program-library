use crate::errors::ErrorCode;
use crate::events::EpochApproved;
use crate::state::{EpochAccount, RewardsAccount, RewardsDistributor};
use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Mint, Token, TokenAccount, Transfer};

/// [rewards_distributor::approve_epoch] accounts.
#[derive(Accounts)]
#[instruction( epoch_nr: u64)]
pub struct ApproveEpoch<'info> {
    /// The [RewardsAccount]
    #[account(mut, has_one = manager @ ErrorCode::Unauthorized)]
    pub rewards_account: Account<'info, RewardsAccount>,

    /// The [EpochAccount]
    #[account(mut,
        seeds = [
         b"EpochAccount".as_ref(),
         epoch_nr.to_le_bytes().as_ref(),
    ],
    bump
    )]
    pub epoch_account: Account<'info, EpochAccount>,

    /// The [RewardsDistributor].
    #[account(
        mut,
        // address = from.owner
    )]
    pub distributor: Account<'info, RewardsDistributor>,

    /// current manager of the program.
    pub manager: Signer<'info>,

    /// Distributor ATA
    #[account(mut)]
    pub distributor_token_account: Account<'info, TokenAccount>,

    /// Manager ATA
    #[account(mut)]
    pub manager_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub mint_account: Account<'info, Mint>,

    /// SPL [Token] program.
    pub token_program: Program<'info, Token>,
}

pub fn approve_epoch_handler(ctx: Context<ApproveEpoch>, epoch_nr: u64, amount: u64) -> Result<()> {
    let rewards_account = &mut ctx.accounts.rewards_account;
    require!(!rewards_account.is_paused, ErrorCode::ShouldNotBePaused);

    let epoch_account = &mut ctx.accounts.epoch_account;
    epoch_account.is_approved = true;

    // Invoke the transfer instruction on the token program
    transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.manager_token_account.to_account_info(),
                to: ctx.accounts.distributor_token_account.to_account_info(),
                authority: ctx.accounts.manager.to_account_info(),
            },
        ),
        amount * 10u64.pow(ctx.accounts.mint_account.decimals as u32), // Transfer amount, adjust for decimals
    )?;

    emit!(EpochApproved { epoch_nr });

    Ok(())
}
