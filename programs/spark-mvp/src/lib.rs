pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("t3i7Wt3aoqXzouwKJ8Q58pW8GMEYyUhHBg8YmckjeJD");

#[program]
pub mod spark_program {
    use super::*;

    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        campaign_seed: u64,
        ending_at: i64,
        funding_goal_in_lamports: u64,
    ) -> Result<()> {
        ctx.accounts.create_campaign(
            campaign_seed,
            ending_at,
            funding_goal_in_lamports,
            &ctx.bumps,
        )
    }

    pub fn create_proposal(ctx: Context<CreateProposal>, ending_at: i64) -> Result<()> {
        ctx.accounts.create_proposal(ending_at, &ctx.bumps)
    }

    pub fn pledge(ctx: Context<Pledge>, pledge_amount_in_lamports: u64) -> Result<()> {
        ctx.accounts.pledge(pledge_amount_in_lamports, &ctx.bumps)
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        ctx.accounts.withdraw(&[ctx.bumps.campaign_vault])
    }
}
