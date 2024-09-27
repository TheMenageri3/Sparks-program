use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};

use crate::error::SparkError;
use crate::state::Campaign;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        constraint = creator.key() == campaign.creator @ SparkError::UnauthorizedCreator
    )]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"campaign",
            campaign.campaign_seed.to_le_bytes().as_ref(),
            campaign.creator.as_ref()
        ],
        bump = campaign.campaign_bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(
        mut,
        seeds = [campaign.key().as_ref()],
        bump
    )]
    pub campaign_vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> Withdraw<'info> {
    pub fn withdraw(&mut self, vault_bump: &[u8]) -> Result<()> {
        // Check if the funding goal is met
        require!(
            self.campaign_vault.to_account_info().lamports()
                >= self.campaign.funding_goal_in_lamports,
            SparkError::CampaignFailedNotEnoughFunds
        );

        // Check if the campaign is still ongoing
        require!(
            Clock::get()?.unix_timestamp > self.campaign.ending_at,
            SparkError::CampaignStillRunning
        );

        // Set up seeds for the vault PDA
        let campaign_key = self.campaign.key();
        let campaign_vault_seeds = &[campaign_key.as_ref(), &[vault_bump[0]]];
        let signer = &[&campaign_vault_seeds[..]];

        // Create the CPI context and perform the transfer
        let cpi_program = self.system_program.to_account_info();
        let cpi_accounts = Transfer {
            from: self.campaign_vault.to_account_info(),
            to: self.creator.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        self.campaign.is_finished = true;

        transfer(cpi_ctx, self.campaign_vault.to_account_info().lamports())
    }
}
