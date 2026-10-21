import type express from 'express';
import type { Pool } from 'pg';
import { machineSchema, officialWeightQuery } from '../domain.js';
import { id } from './shared.js';

export function registerMachineRoutes(app: express.Express, pool: Pool) {
  app.get('/api/brands', async (_req, res) =>
    res.json((await pool.query('SELECT * FROM brands ORDER BY id')).rows),
  );
  // Manufacturer reference values are read-only reference data seeded by migration 009.
  app.get('/api/official-machine-weights', async (req, res) => {
    const q = officialWeightQuery.parse(req.query);
    res.json(
      (
        await pool.query(
          `SELECT * FROM official_machine_weights WHERE $1::text IS NULL OR brand=$1 ORDER BY brand, lineup, model_name, setting`,
          [q.brand ?? null],
        )
      ).rows,
    );
  });
  app.get('/api/machines', async (_req, res) =>
    res.json(
      (
        await pool.query(
          `SELECT m.*, b.name brand, o.status official_status, o.model_name official_model_name, o.setting official_setting,
             o.raw_value official_raw_value, o.raw_unit official_raw_unit, o.weight_kg official_weight_kg, o.basis official_basis,
             o.source_url official_source_url, o.checked_date official_checked_date, o.notes official_notes
           FROM machines m JOIN brands b ON b.id=m.brand_id
           LEFT JOIN official_machine_weights o ON o.id=m.official_weight_id ORDER BY m.id DESC`,
        )
      ).rows,
    ),
  );
  app.post('/api/machines', async (req, res) => {
    const m = machineSchema.parse(req.body);
    res
      .status(201)
      .json(
        (
          await pool.query(
            'INSERT INTO machines(brand_id,name,base_weight,notes,official_weight_id,single_joint) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
            [
              m.brand_id,
              m.name,
              m.base_weight,
              m.notes,
              m.official_weight_id ?? null,
              m.single_joint ?? false,
            ],
          )
        ).rows[0],
      );
  });
  app.put('/api/machines/:id', async (req, res) => {
    const m = machineSchema.parse(req.body);
    const r = await pool.query(
      'UPDATE machines SET brand_id=$1,name=$2,base_weight=$3,notes=$4,official_weight_id=CASE WHEN $7::boolean THEN $5::integer ELSE official_weight_id END,single_joint=COALESCE($8::boolean,single_joint) WHERE id=$6 RETURNING *',
      [
        m.brand_id,
        m.name,
        m.base_weight,
        m.notes,
        m.official_weight_id ?? null,
        id(req.params.id),
        m.official_weight_id !== undefined,
        m.single_joint ?? null,
      ],
    );
    res.status(r.rowCount ? 200 : 404).json(r.rows[0] ?? { error: '머신을 찾을 수 없습니다' });
  });
}
