#!/usr/bin/env python3
"""Export misconceptions from Excel to SQL INSERT statements"""
import openpyxl

wb = openpyxl.load_workbook('/home/ubuntu/upload/الشبهات_وردودها.xlsx', read_only=True)

# Read Arabic sheet
ws_ar = wb['الشبهات وردودها']
ws_nl = wb['Twijfels en weerlegging']
ws_en = wb['Misconceptions and Refutations']

def get_rows(ws):
    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] and str(row[0]).strip().isdigit():
            rows.append(row)
    return rows

rows_ar = get_rows(ws_ar)
rows_nl = get_rows(ws_nl)
rows_en = get_rows(ws_en)

wb.close()

print(f"Arabic rows: {len(rows_ar)}")
print(f"Dutch rows: {len(rows_nl)}")
print(f"English rows: {len(rows_en)}")

# Structure per row:
# 0: number
# 1: age_group/category
# 2: misconception (the doubt/claim)
# 3: clarification (their argument)
# 4: refutation (correction)
# 5: evidences (daleel)
# 6: additional evidence/scholars
# 7: practical benefits/application

def escape_sql(s):
    if not s:
        return ''
    return str(s).replace("'", "''").replace("\\", "\\\\")

# Write SQL in batches of 10
batch_size = 10
total = len(rows_ar)
total_batches = (total + batch_size - 1) // batch_size

for batch_idx in range(total_batches):
    start = batch_idx * batch_size
    end = min(start + batch_size, total)
    
    sql_parts = []
    for i in range(start, end):
        row_ar = rows_ar[i]
        row_nl = rows_nl[i] if i < len(rows_nl) else ['']*8
        row_en = rows_en[i] if i < len(rows_en) else ['']*8
        
        age_group = escape_sql(row_ar[1])
        category = escape_sql(row_ar[1])  # Same as age_group in this file
        
        misconception_ar = escape_sql(row_ar[2])
        misconception_nl = escape_sql(row_nl[2])
        misconception_en = escape_sql(row_en[2])
        
        clarification_ar = escape_sql(row_ar[3])
        clarification_nl = escape_sql(row_nl[3])
        clarification_en = escape_sql(row_en[3])
        
        refutation_ar = escape_sql(row_ar[4])
        refutation_nl = escape_sql(row_nl[4])
        refutation_en = escape_sql(row_en[4])
        
        evidences_ar = escape_sql(str(row_ar[5] or '') + '\n' + str(row_ar[6] or ''))
        evidences_nl = escape_sql(str(row_nl[5] or '') + '\n' + str(row_nl[6] or ''))
        evidences_en = escape_sql(str(row_en[5] or '') + '\n' + str(row_en[6] or ''))
        
        practical_ar = escape_sql(row_ar[7])
        practical_nl = escape_sql(row_nl[7])
        practical_en = escape_sql(row_en[7])
        
        sort_order = i + 1
        
        sql_parts.append(f"('{age_group}', '{category}', '{misconception_ar}', '{misconception_nl}', '{misconception_en}', '{clarification_ar}', '{clarification_nl}', '{clarification_en}', '{refutation_ar}', '{refutation_nl}', '{refutation_en}', '{evidences_ar}', '{evidences_nl}', '{evidences_en}', '{practical_ar}', '{practical_nl}', '{practical_en}', {sort_order})")
    
    sql = f"""INSERT INTO misconceptions (age_group, category, misconception_ar, misconception_nl, misconception_en, clarification_ar, clarification_nl, clarification_en, refutation_ar, refutation_nl, refutation_en, evidences_ar, evidences_nl, evidences_en, practical_benefits_ar, practical_benefits_nl, practical_benefits_en, sort_order) VALUES\n{','.join(sql_parts)};"""
    
    with open(f'/home/ubuntu/opvoedadvies_apk/scripts/misconceptions_batch_{batch_idx:02d}.sql', 'w') as f:
        f.write(sql)

print(f"Generated {total_batches} SQL batch files for misconceptions")
