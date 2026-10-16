#!/usr/bin/env python3
"""Vérifie qu'un export SQL de la base (wrangler d1 export) se restaure dans un SQLite neuf.
Usage : python3 scripts/verifier-restauration.py sauvegarde.sql
Contrôles : intégrité SQLite, clés étrangères, présence des tables attendues, nombre de lignes par table."""
import sqlite3, sys

ATTENDUES = ['boutiques', 'utilisateurs', 'offres', 'commandes', 'dossiers_osb', 'osb_justificatifs', 'paiements_evenements',
             'journal_audit', 'publications', 'essais_generation', 'inscriptions', 'compteurs_factures', 'ventes_mensuelles']

def main(path):
    db = sqlite3.connect(':memory:')
    with open(path, encoding='utf-8') as f:
        db.executescript(f.read())
    ok = db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    fk = db.execute('PRAGMA foreign_key_check').fetchall()
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    manquantes = [t for t in ATTENDUES if t not in tables]
    print(f"intégrité : {'ok' if ok else 'ÉCHEC'} · clés étrangères orphelines : {len(fk)} · tables manquantes : {manquantes or 'aucune'}")
    for t in ATTENDUES:
        if t in tables:
            print(f"  {t:24} {db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]:>7} lignes")
    sys.exit(0 if ok and not fk and not manquantes else 1)

if __name__ == '__main__':
    main(sys.argv[1])
