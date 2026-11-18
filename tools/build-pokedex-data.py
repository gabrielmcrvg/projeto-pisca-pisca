#!/usr/bin/env python3
"""Gera src/renderer/pokedex/data.js a partir dos CSVs do PokéAPI.

Uso:
    1. Baixe estes arquivos de https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv
       para uma pasta: pokemon.csv, pokemon_types.csv, pokemon_species.csv, pokemon_forms.csv,
       types.csv, pokemon_species_names.csv, pokemon_form_names.csv
    2. python tools/build-pokedex-data.py caminho/da/pasta

Entram as espécies (1–1025) e as formas regionais ou que mudam de tipo; ficam de fora
Mega, Gigantamax e formas só cosméticas.
"""
import collections, csv, json, os, sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'renderer', 'pokedex', 'data.js')
R = lambda f: list(csv.DictReader(open(os.path.join(SRC, f), encoding='utf-8')))
types = {r['id']: r['identifier'] for r in R('types.csv')}
species = {r['id']: r for r in R('pokemon_species.csv')}
sp_name = {r['pokemon_species_id']: r['name'] for r in R('pokemon_species_names.csv') if r['local_language_id'] == '9'}
ptypes = collections.defaultdict(list)
for r in sorted(R('pokemon_types.csv'), key=lambda r: int(r['slot'])): ptypes[r['pokemon_id']].append(types[r['type_id']])
forms = {r['pokemon_id']: r for r in R('pokemon_forms.csv') if r['is_default'] == '1'}
form_name = {r['pokemon_form_id']: r for r in R('pokemon_form_names.csv') if r['local_language_id'] == '9'}
GEN = {'1': 'kanto', '2': 'johto', '3': 'hoenn', '4': 'sinnoh', '5': 'unova', '6': 'kalos', '7': 'alola', '8': 'galar', '9': 'paldea'}
REGIONAL = {'alola': 'alola', 'galar': 'galar', 'hisui': 'hisui', 'paldea': 'paldea'}
SKIP = ('-mega', '-gmax', '-primal', '-totem', '-starter', '-eternamax')
PT_EXTRA = {'combat-breed': 'Raça Combate', 'blaze-breed': 'Raça Chamas', 'aqua-breed': 'Raça Aquática', 'standard': 'Padrão', 'zen': 'Zen'}
PT_REGION = {'alola': 'Alola', 'galar': 'Galar', 'hisui': 'Hisui', 'paldea': 'Paldea'}
pokemon = R('pokemon.csv')
default_types = {p['species_id']: ptypes[p['id']] for p in pokemon if p['is_default'] == '1'}
out = []
for p in pokemon:
    sid = p['species_id']; s = species[sid]; ident = p['identifier']; t = ptypes[p['id']]
    region = 'hisui' if 899 <= int(sid) <= 905 else GEN[s['generation_id']]
    entry = {'n': int(sid), 'id': int(p['id']), 'name': sp_name[sid], 't': t, 'r': region}
    if s['is_legendary'] == '1': entry['leg'] = 1
    if s['is_mythical'] == '1': entry['mit'] = 1
    if p['is_default'] == '1':
        out.append(entry); continue
    if any(k in ident for k in SKIP) or ident.startswith('pikachu-'): continue
    reg = next((REGIONAL[k] for k in REGIONAL if f'-{k}' in ident), None)
    if not reg and sorted(t) == sorted(default_types[sid]): continue   # forma só cosmética
    f = forms.get(p['id']); fn = form_name.get(f['id']) if f else None
    if reg:
        label = f"{sp_name[sid]} de {PT_REGION[reg]}"
        extra = ident.split(f'-{reg}', 1)[1].strip('-')
        if extra: label += f" ({PT_EXTRA.get(extra, extra.replace('-', ' ').title())})"
        entry['r'] = reg
    else:
        form = ((fn or {}).get('form_name') or ident.split('-',1)[1].replace('-',' ').title())
        for suffix in (' Forme', ' Form', ' Style', ' Mask', ' Rider'):
            form = form.replace(suffix, '')
        form = form.replace(sp_name[sid], '').strip() or form
        label = f"{sp_name[sid]} ({form})"
    entry['name'] = label; entry['form'] = 1
    out.append(entry)
out.sort(key=lambda e: (e['n'], e.get('form', 0), e['name']))

REGIONS = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'hisui', 'paldea']
rows = []
for e in out:
    flags = (1 if e.get('form') else 0) | (2 if e.get('leg') else 0) | (4 if e.get('mit') else 0)
    row = [e['n'], e['name'], '/'.join(e['t']), REGIONS.index(e['r']), flags]
    if e['id'] != e['n']:
        row.append(e['id'])
    rows.append(row)
js = ("// Dados da Pokédex: espécies 1–1025 e formas regionais ou que mudam de tipo (sem Mega/Gigantamax).\n"
      "// Fonte: PokéAPI (github.com/PokeAPI/pokeapi, data/v2/csv). Regerar: tools/build-pokedex-data.py.\n"
      "// Formato: [número, nome, 'tipo1/tipo2', região, marcas, código da forma?]  marcas: 1 = forma, 2 = lendário, 4 = mítico\n"
      "// O código da forma (PokéAPI) só aparece quando difere do número; é usado para buscar a imagem.\n"
      "const POKEDEX_REGIONS = " + json.dumps(REGIONS) + ";\n"
      "const POKEDEX = [\n" + ",\n".join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in rows) + "\n];\n")
open(OUT, 'w', encoding='utf-8').write(js)
print(f'{len(rows)} entradas ({sum(1 for e in out if e.get("form"))} formas) → {os.path.normpath(OUT)}')
