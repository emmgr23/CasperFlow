#![cfg_attr(not(test), no_std)]
extern crate alloc;

//! CasperFlow Escrow — conditional payment for the agent economy.
//!
//! The problem (see OutcomePay / Escrow402 in the buildathon): x402 payments are
//! final. A buyer agent pays per request and, if the seller returns junk, the
//! money is gone. This contract escrows the payment on Casper and releases it to
//! the seller ONLY when delivery is verified, refunding the buyer otherwise.
//!
//! Trust model: a `resolver` (the buyer's own agent, a verifier set, or a small
//! multisig using Casper's weighted keys) calls `release` or `refund` after
//! checking the seller's response. The funds never leave the contract until one
//! of those two outcomes is decided, so neither side can be cheated.
//!
//! NOTE: this is the contract SOURCE. Compile it with `cargo odra build`
//! (Odra 1.4) to produce the WASM, then point CasperFlow's escrow node at it.
//! It is written to the published Odra API but has not been compiled in this
//! environment — verify against `cargo odra build` before any real use.

use odra::casper_types::U512;
use odra::prelude::*;

/// One escrowed deal.
#[odra::odra_type]
pub struct Deal {
    pub buyer: Address,
    pub seller: Address,
    pub amount: U512,
    /// 0 = open, 1 = released to seller, 2 = refunded to buyer
    pub status: u8,
}

#[odra::odra_error]
pub enum Error {
    DealNotFound = 60001,
    NotResolver = 60002,
    AlreadySettled = 60003,
    ZeroAmount = 60004,
}

#[odra::event]
pub struct Deposited {
    pub id: u64,
    pub buyer: Address,
    pub seller: Address,
    pub amount: U512,
}

#[odra::event]
pub struct Released {
    pub id: u64,
    pub seller: Address,
    pub amount: U512,
}

#[odra::event]
pub struct Refunded {
    pub id: u64,
    pub buyer: Address,
    pub amount: U512,
}

#[odra::module(events = [Deposited, Released, Refunded], errors = Error)]
pub struct Escrow {
    /// Who is allowed to decide release/refund (verifier / buyer agent / multisig).
    resolver: Var<Address>,
    next_id: Var<u64>,
    deals: Mapping<u64, Deal>,
}

#[odra::module]
impl Escrow {
    /// Deploy-time: set the resolver authorised to settle deals.
    pub fn init(&mut self, resolver: Address) {
        self.resolver.set(resolver);
        self.next_id.set(0);
    }

    /// Buyer escrows `attached_value` CSPR for `seller`. Returns the deal id.
    #[odra(payable)]
    pub fn deposit(&mut self, seller: Address) -> u64 {
        let amount = self.env().attached_value();
        if amount.is_zero() {
            self.env().revert(Error::ZeroAmount);
        }
        let buyer = self.env().caller();
        let id = self.next_id.get_or_default();
        self.deals.set(
            &id,
            Deal {
                buyer,
                seller,
                amount,
                status: 0,
            },
        );
        self.next_id.set(id + 1);
        self.env().emit_event(Deposited {
            id,
            buyer,
            seller,
            amount,
        });
        id
    }

    /// Resolver: delivery verified → pay the seller.
    pub fn release(&mut self, id: u64) {
        self.assert_resolver();
        let mut deal = self.load(id);
        deal.status = 1;
        self.deals.set(&id, deal.clone());
        self.env().transfer_tokens(&deal.seller, &deal.amount);
        self.env().emit_event(Released {
            id,
            seller: deal.seller,
            amount: deal.amount,
        });
    }

    /// Resolver: delivery failed / timed out → refund the buyer.
    pub fn refund(&mut self, id: u64) {
        self.assert_resolver();
        let mut deal = self.load(id);
        deal.status = 2;
        self.deals.set(&id, deal.clone());
        self.env().transfer_tokens(&deal.buyer, &deal.amount);
        self.env().emit_event(Refunded {
            id,
            buyer: deal.buyer,
            amount: deal.amount,
        });
    }

    /// Read a deal (for indexers / the CasperFlow UI).
    pub fn get_deal(&self, id: u64) -> Deal {
        self.load(id)
    }

    pub fn resolver(&self) -> Address {
        self.resolver.get_or_revert_with(Error::DealNotFound)
    }

    // ── internal ──
    fn load(&self, id: u64) -> Deal {
        let deal = self.deals.get(&id).unwrap_or_revert_with(&self.env(), Error::DealNotFound);
        if deal.status != 0 {
            self.env().revert(Error::AlreadySettled);
        }
        deal
    }

    fn assert_resolver(&self) {
        let resolver = self.resolver.get_or_revert_with(Error::NotResolver);
        if self.env().caller() != resolver {
            self.env().revert(Error::NotResolver);
        }
    }
}
