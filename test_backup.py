import json

with open('Backup_2026-04-19.json', 'r') as f:
    root = json.load(f)
    data = root.get('data', {})

print(f"=== BACKUP TEST SUMMARY ===")    
print(f"Export Date: {root.get('export_date')}")
print(f"Profile Loaded? {'Yes' if 'profile' in data else 'No'}")
print(f"Categories: {len(data.get('categories', []))}")
print(f"Buckets: {len(data.get('buckets', []))}")
print(f"Investments: {len(data.get('investments', []))}")
print(f"Transactions: {len(data.get('transactions', []))}")

transactions = data.get('transactions', [])
investments = data.get('investments', [])
buckets = data.get('buckets', [])

print("\n--- 1. Floating Point Check ---")
dirty_floats = 0
for t in transactions:
    val = t.get('amount', 0)
    if round(val, 2) != val:
        print(f" Dirty Float: {val} (tx: {t.get('description', 'No desc')} id: {t.get('id')})")
        dirty_floats += 1
print(f" Total Dirty Floats: {dirty_floats}")

print("\n--- 2. Investment Integrity (Atomic Group Check) ---")
for inv in investments:
    inv_id = inv.get('id')
    inv_name = inv.get('name')
    txs = [t for t in transactions if t.get('investment_id') == inv_id]
    
    calc_invested = 0
    calc_qty = 0
    fees = 0
    trade_out = 0
    for t in txs:
        # Transfer is the money moved IN or OUT of the portfplio
        if t.get('type') == 'transfer':
            calc_invested += t.get('amount', 0)
        
        if 'asset_quantity' in t and t.get('asset_quantity'):
           if t.get('type') == 'expense':
               calc_qty += t.get('asset_quantity')
           elif t.get('type') == 'income':
               calc_qty -= t.get('asset_quantity')
               trade_out += t.get('amount', 0)
               
        if t.get('type') == 'expense' and 'Fee' in t.get('description', '') or 'Commissione' in t.get('description', ''):
             fees += t.get('amount', 0)

    print(f" Inv [{inv_name}]:")
    print(f"  - Stored Invested = {inv.get('invested_amount',0):.2f} | Acc. Transfers = {calc_invested:.2f}")
    if round(inv.get('invested_amount',0),2) != round(calc_invested,2):
        print("    -> ⚠️ DISCREPANCY DETECTED IN INVESTED AMOUNT!")
    print(f"  - Stored Qty = {inv.get('quantity',0):.2f} | Calc Qty = {calc_qty:.2f}")

print("\n--- 3. Bucket Ledger Integrity Check ---")
for b in buckets:
    b_id = b.get('id')
    txs = [t for t in transactions if t.get('bucket_id') == b_id]
    
    # We must replicate the logic of bucket balance
    calc_balance = 0
    for t in txs:
        # based on Transactions.tsx: t.type == 'expense' restores money. transfer out (-), transfer in (+)
        amt = abs(t.get('amount', 0))
        if t.get('type') == 'expense':
            calc_balance += amt  # Spese riaccreditano (rollback)? Wait, the bucket balance is literally sum(transfers) in real world?
            # Actually, `TransactionForm.tsx` inserts transfer with negative if putting INTO bucket... wait. No!
            pass

    # Let's just sum all transfers to this bucket
    transfers = [t for t in txs if t.get('type') == 'transfer']
    # If transfer from Unassigned to Bucket: amount is -, bucket balance +
    # Let's check how the JSON stores transfers

