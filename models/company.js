
"use strict";

const db = require("../db");
const { BadRequestError, NotFoundError } = require("../expressError");
const { sqlForPartialUpdate } = require("../helpers/sql");

/** Related functions for companies. */
class Company {
  /** Create a company (from data), update db, return new company data.
   *
   * data should be { handle, name, description, numEmployees, logoUrl }
   *
   * Returns { handle, name, description, numEmployees, logoUrl }
   *
   * Throws BadRequestError if company already in database.
   */
  static async create({ handle, name, description, numEmployees, logoUrl }) {
    const duplicateCheck = await db.query(
      `SELECT handle FROM companies WHERE handle = $1`,
      [handle]
    );

    if (duplicateCheck.rows[0]) {
      throw new BadRequestError(`Duplicate company: ${handle}`);
    }

    const result = await db.query(
      `INSERT INTO companies
       (handle, name, description, num_employees, logo_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING 
         handle, 
         name, 
         description, 
         num_employees AS "numEmployees", 
         logo_url AS "logoUrl"`,
      [handle, name, description, numEmployees, logoUrl]
    );

    return result.rows[0];
  }

  /** Find all companies with optional filters.
   *
   * searchFilters: { minEmployees, maxEmployees, name }
   * Returns [{ handle, name, description, numEmployees, logoUrl }, ...]
   */
  static async findAll(searchFilters = {}) {
    let query = `SELECT 
                   handle, 
                   name, 
                   description, 
                   num_employees AS "numEmployees", 
                   logo_url AS "logoUrl" 
                 FROM companies`;
    
    const whereClauses = [];
    const values = [];
    const { minEmployees, maxEmployees, name } = searchFilters;

    // Validate min/max employees
    if (minEmployees > maxEmployees) {
      throw new BadRequestError("Min employees cannot exceed max employees");
    }

    // Build WHERE clauses
    if (minEmployees !== undefined) {
      values.push(minEmployees);
      whereClauses.push(`num_employees >= $${values.length}`);
    }

    if (maxEmployees !== undefined) {
      values.push(maxEmployees);
      whereClauses.push(`num_employees <= $${values.length}`);
    }

    if (name) {
      values.push(`%${name}%`);
      whereClauses.push(`name ILIKE $${values.length}`);
    }

    // Combine clauses
    if (whereClauses.length > 0) {
      query += " WHERE " + whereClauses.join(" AND ");
    }

    // Finalize and execute query
    query += " ORDER BY name";
    const companiesRes = await db.query(query, values);
    return companiesRes.rows;
  }

  /** Get company by handle with associated jobs.
   * Returns { handle, name, description, numEmployees, logoUrl, jobs }
   * Throws NotFoundError if not found.
   */
  static async get(handle) {
    const companyRes = await db.query(
      `SELECT 
         handle, 
         name, 
         description, 
         num_employees AS "numEmployees", 
         logo_url AS "logoUrl"
       FROM companies
       WHERE handle = $1`,
      [handle]
    );

    const company = companyRes.rows[0];
    if (!company) throw new NotFoundError(`No company: ${handle}`);

    // Get associated jobs
    const jobsRes = await db.query(
      `SELECT 
         id, 
         title, 
         salary, 
         equity 
       FROM jobs
       WHERE company_handle = $1
       ORDER BY id`,
      [handle]
    );

    company.jobs = jobsRes.rows;
    return company;
  }

  /** Update company data with partial update.
   * Data can include: { name, description, numEmployees, logoUrl }
   * Returns updated company data
   * Throws NotFoundError if not found.
   */
  static async update(handle, data) {
    const { setCols, values } = sqlForPartialUpdate(data, {
      numEmployees: "num_employees",
      logoUrl: "logo_url",
    });

    const handleVarIdx = "$" + (values.length + 1);
    const querySql = `
      UPDATE companies
      SET ${setCols}
      WHERE handle = ${handleVarIdx}
      RETURNING 
        handle, 
        name, 
        description, 
        num_employees AS "numEmployees", 
        logo_url AS "logoUrl"
    `;

    const result = await db.query(querySql, [...values, handle]);
    const company = result.rows[0];

    if (!company) throw new NotFoundError(`No company: ${handle}`);
    return company;
  }

  /** Delete company from database.
   * Returns undefined
   * Throws NotFoundError if company not found.
   */
  static async remove(handle) {
    const result = await db.query(
      `DELETE FROM companies
       WHERE handle = $1
       RETURNING handle`,
      [handle]
    );

    const company = result.rows[0];
    if (!company) throw new NotFoundError(`No company: ${handle}`);
  }
}

module.exports = Company;
