export interface TableDef {
  name: string;
  purpose: string;
  columns: string[];
}

/**
 * Every question on the site is written against this one catalog, so you build
 * familiarity with the tables instead of re-reading a new schema each time.
 */
export const SCHEMA: TableDef[] = [
  {
    name: 'employees',
    purpose: 'Staff roster, self-referencing through manager_id.',
    columns: [
      'emp_id INT PK',
      'emp_name VARCHAR',
      'email VARCHAR',
      'dept_id INT FK -> departments',
      'manager_id INT FK -> employees.emp_id (NULL for the CEO)',
      'salary DECIMAL',
      'hire_date DATE',
    ],
  },
  {
    name: 'departments',
    purpose: 'Department lookup.',
    columns: ['dept_id INT PK', 'dept_name VARCHAR', 'location VARCHAR'],
  },
  {
    name: 'customers',
    purpose: 'Customer master.',
    columns: [
      'customer_id INT PK',
      'customer_name VARCHAR',
      'email VARCHAR',
      'city VARCHAR',
      'country VARCHAR',
      'signup_date DATE',
    ],
  },
  {
    name: 'orders',
    purpose: 'Order header, one row per order.',
    columns: [
      'order_id INT PK',
      'customer_id INT FK -> customers',
      'order_date DATE',
      'status VARCHAR (placed | shipped | delivered | cancelled)',
      'amount DECIMAL',
    ],
  },
  {
    name: 'order_items',
    purpose: 'Order lines, one row per product on an order.',
    columns: [
      'order_item_id INT PK',
      'order_id INT FK -> orders',
      'product_id INT FK -> products',
      'quantity INT',
      'unit_price DECIMAL',
    ],
  },
  {
    name: 'products',
    purpose: 'Product catalog.',
    columns: [
      'product_id INT PK',
      'product_name VARCHAR',
      'category VARCHAR',
      'price DECIMAL',
      'tags VARCHAR (comma-separated, deliberately denormalised)',
    ],
  },
  {
    name: 'sales',
    purpose: 'Daily sales fact, already aggregated per product/region/day.',
    columns: [
      'sale_id INT PK',
      'product_id INT FK -> products',
      'region VARCHAR',
      'sale_date DATE',
      'amount DECIMAL',
      'quantity INT',
    ],
  },
  {
    name: 'page_views',
    purpose: 'Clickstream events, one row per page view.',
    columns: [
      'view_id BIGINT PK',
      'user_id INT',
      'page VARCHAR',
      'view_ts TIMESTAMP',
      'session_id VARCHAR',
    ],
  },
  {
    name: 'logins',
    purpose: 'One row per user login day — the table for streak / gap questions.',
    columns: ['login_id INT PK', 'user_id INT', 'login_date DATE'],
  },
  {
    name: 'customer_dim',
    purpose: 'Slowly Changing Dimension Type 2 version of customers.',
    columns: [
      'cust_key INT PK (surrogate)',
      'customer_id INT (business key)',
      'customer_name VARCHAR',
      'city VARCHAR',
      'start_date DATE',
      'end_date DATE (9999-12-31 for the open row)',
      'is_current BOOLEAN',
    ],
  },
  {
    name: 'customers_stg',
    purpose: 'Today-s landing copy of customers, used for change detection.',
    columns: [
      'customer_id INT',
      'customer_name VARCHAR',
      'email VARCHAR',
      'city VARCHAR',
      'country VARCHAR',
    ],
  },
  {
    name: 'subscriptions',
    purpose: 'Subscription intervals, used for overlap questions.',
    columns: [
      'subscription_id INT PK',
      'customer_id INT',
      'plan VARCHAR',
      'start_date DATE',
      'end_date DATE',
    ],
  },
  {
    name: 'sales_2023 / sales_2024',
    purpose: 'Two same-shaped yearly tables, used for UNION / EXCEPT / INTERSECT.',
    columns: ['product_id INT', 'region VARCHAR', 'sale_date DATE', 'amount DECIMAL'],
  },
];

export const DIALECT_NOTE =
  'Solutions are written in ANSI SQL and verified against PostgreSQL semantics. Where a feature is vendor-specific (PIVOT, STRING_SPLIT, DATEDIFF, LIMIT vs TOP), the question carries a dialect note with the portable alternative.';
