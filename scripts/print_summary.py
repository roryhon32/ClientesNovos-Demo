import json

with open('scripts/audit_result.json', 'r', encoding='utf-16') as f:
    data = json.load(f)

print('=== TOP 15 CLIENTES ===')
for c in data['top_15_clients']:
    name = c['nome_cliente'] or 'SEM NOME'
    print(f"{c['raiz_cnpj']} | {name[:32]:32s} | {c['status_atual']:11s} | R$ {c['faturamento_liquido_acumulado']:>14,.2f} ({c['share_fat_pct']:>5.2f}%) | MB%: {c['mb_pct']:>5.2f}%")

print('\n=== DISTRIBUIÇÃO POR BU ===')
for b in data['business_unit_distribution']:
    fat = b['faturamento_liquido'] if b['faturamento_liquido'] is not None else 0
    pct = b['share_fat_pct'] if b['share_fat_pct'] is not None else 0
    mb = b['mb_pct'] if b['mb_pct'] is not None else 0
    print(f"{b['business_unit']:25s} | Trans: {b['transacoes']:>6,} | Clientes: {b['clientes_b2b']:>5,} | R$ {fat:>14,.2f} ({pct:>5.2f}%) | MB%: {mb:>5.2f}%")

print('\n=== DQ SUMMARY ===')
for k, v in data['dq_summary'].items():
    print(f"{k:35s}: {v}")
