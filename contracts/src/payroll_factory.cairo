#[starknet::contract]
pub mod PayrollFactory {
    use starknet::{
        ContractAddress, ClassHash,
        get_caller_address, get_contract_address, get_block_timestamp,
        syscalls::deploy_syscall,
        storage::{StoragePointerReadAccess, StoragePointerWriteAccess, Map, StoragePathEntry},
    };
    use core::poseidon::poseidon_hash_span;
    use crate::interface::IPayrollFactory;

    #[storage]
    struct Storage {
        payroll_class_hash: ClassHash,
        company_of: Map<ContractAddress, ContractAddress>,
        is_registered: Map<ContractAddress, bool>,
        deploy_count: u64,
        /// Employee lookup: tongo_pubkey_hash → payroll contract
        employee_company: Map<felt252, ContractAddress>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {}

    #[constructor]
    fn constructor(ref self: ContractState, payroll_class_hash: ClassHash) {
        self.payroll_class_hash.write(payroll_class_hash);
        self.deploy_count.write(0);
    }

    #[abi(embed_v0)]
    impl PayrollFactoryImpl of IPayrollFactory<ContractState> {
        fn register_company(
            ref self: ContractState,
            company_name: ByteArray,
            tongo_contract: ContractAddress,
            employer_pubkey_x: felt252,
            employer_pubkey_y: felt252,
        ) -> ContractAddress {
            let caller = get_caller_address();
            let zero: ContractAddress = 0.try_into().unwrap();
            let existing = self.company_of.entry(caller).read();
            assert!(existing == zero, "Company already registered");

            let count = self.deploy_count.read();
            let ts: felt252 = get_block_timestamp().into();
            let salt = poseidon_hash_span(
                array![caller.into(), count.into(), ts, 'STEALTHPAY'].span()
            );
            self.deploy_count.write(count + 1);

            // Pass factory address to PayrollManager constructor
            let factory_addr = get_contract_address();
            let mut calldata: Array<felt252> = array![];
            caller.serialize(ref calldata);
            tongo_contract.serialize(ref calldata);
            company_name.serialize(ref calldata);
            employer_pubkey_x.serialize(ref calldata);
            employer_pubkey_y.serialize(ref calldata);
            factory_addr.serialize(ref calldata);

            let class_hash = self.payroll_class_hash.read();
            let (payroll_address, _) = deploy_syscall(
                class_hash, salt, calldata.span(), true
            ).expect('Deploy failed');

            self.company_of.entry(caller).write(payroll_address);
            self.is_registered.entry(payroll_address).write(true);

            // Event emission removed
            payroll_address
        }

        fn delete_company(ref self: ContractState) {
            let caller = get_caller_address();
            let payroll = self.company_of.entry(caller).read();
            let zero: ContractAddress = 0.try_into().unwrap();
            assert!(payroll != zero, "No company registered");

            self.company_of.entry(caller).write(zero);
            self.is_registered.entry(payroll).write(false);
            // Event emission removed
        }

        fn bind_employee(ref self: ContractState, pubkey_hash: felt252) {
            let caller = get_caller_address();
            // Only registered payroll contracts can bind employees
            assert!(self.is_registered.entry(caller).read(), "Not a registered payroll");
            self.employee_company.entry(pubkey_hash).write(caller);
        }

        fn unbind_employee(ref self: ContractState, pubkey_hash: felt252) {
            let caller = get_caller_address();
            assert!(self.is_registered.entry(caller).read(), "Not a registered payroll");
            let zero: ContractAddress = 0.try_into().unwrap();
            self.employee_company.entry(pubkey_hash).write(zero);
        }

        fn get_employee_company(self: @ContractState, pubkey_hash: felt252) -> ContractAddress {
            self.employee_company.entry(pubkey_hash).read()
        }

        fn get_company(self: @ContractState, employer: ContractAddress) -> ContractAddress {
            self.company_of.entry(employer).read()
        }

        fn my_company(self: @ContractState) -> ContractAddress {
            let caller = get_caller_address();
            self.company_of.entry(caller).read()
        }

        fn is_registered_payroll(self: @ContractState, payroll: ContractAddress) -> bool {
            self.is_registered.entry(payroll).read()
        }

        fn get_payroll_class_hash(self: @ContractState) -> ClassHash {
            self.payroll_class_hash.read()
        }
    }
}
