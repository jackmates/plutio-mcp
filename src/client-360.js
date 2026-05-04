/**
 * plutio_client_360 — compound lookup.
 *
 * Resolves a person from { personId | email | name }, then fans out to fetch
 * their company, projects, invoices, and recurring subscriptions in parallel.
 * Replaces a 4-6 round-trip "tell me everything about <client>" workflow with
 * one tool call.
 *
 * Plutio's relationship model varies by deployment, so this tool is forgiving:
 * relations are looked up via multiple plausible filters (clientId, personId,
 * companyId) and any path that returns nothing is reported as count: 0
 * rather than throwing.
 */

function isString(v) {
  return typeof v === 'string' && v.length > 0;
}

async function resolvePerson(client, { personId, email, name, business }) {
  if (personId) {
    const result = await client.request('people', {
      query: { q: { _id: personId }, limit: 1 },
      business
    });
    if (Array.isArray(result) && result[0]) return result[0];
    if (result && !Array.isArray(result) && result._id === personId) return result;
    throw new Error(`No person found with _id=${personId}`);
  }

  if (email) {
    const result = await client.request('people', {
      query: { q: { 'contactEmails.email': email }, limit: 5 },
      business
    });
    const list = Array.isArray(result) ? result : [];
    if (list.length === 0) throw new Error(`No person matched email=${email}`);
    if (list.length > 1) throw new Error(`Email ${email} matched ${list.length} people; pass personId to disambiguate`);
    return list[0];
  }

  if (name && (isString(name.first) || isString(name.last))) {
    const filter = {};
    if (isString(name.first)) filter['name.first'] = { $regex: name.first, $options: 'i' };
    if (isString(name.last)) filter['name.last'] = { $regex: name.last, $options: 'i' };
    const result = await client.request('people', {
      query: { q: filter, limit: 5 },
      business
    });
    const list = Array.isArray(result) ? result : [];
    if (list.length === 0) throw new Error(`No person matched name=${JSON.stringify(name)}`);
    if (list.length > 1) {
      throw new Error(
        `Name matched ${list.length} people; refine name or pass personId. Matches: ${list
          .map((p) => `${p?.name?.first || ''} ${p?.name?.last || ''} (${p._id})`)
          .join(', ')}`
      );
    }
    return list[0];
  }

  throw new Error('Provide personId, email, or name.{first,last}.');
}

async function safeList(client, path, query, business) {
  try {
    const result = await client.request(path, { query, business });
    return Array.isArray(result) ? result : (result ? [result] : []);
  } catch (error) {
    return { _error: error.message || String(error), _path: path };
  }
}

function pickInvoiceTotals(invoices) {
  let total = 0;
  let paid = 0;
  let unpaid = 0;
  let currency;
  for (const inv of invoices) {
    if (!inv || typeof inv !== 'object') continue;
    const amount = Number(inv.amount || 0);
    total += amount;
    if (inv.status === 'paid' || inv.paidAt) paid += amount;
    else unpaid += amount;
    if (!currency && inv.currency) currency = inv.currency;
  }
  return { total, paid, unpaid, currency };
}

function createClient360(client) {
  return async ({
    personId,
    email,
    name,
    includeProjects = true,
    includeInvoices = true,
    includeSubscriptions = true,
    business
  }) => {
    const person = await resolvePerson(client, { personId, email, name, business });
    const resolvedPersonId = person._id;
    const companyId =
      person.companyId ||
      (Array.isArray(person.companies) && person.companies[0] && person.companies[0]._id) ||
      null;

    const tasks = [];
    let companyResult = null;
    let projects = null;
    let invoices = null;
    let subscriptions = null;

    if (companyId) {
      tasks.push(
        client
          .request('companies', { query: { q: { _id: companyId }, limit: 1 }, business })
          .then((result) => {
            companyResult = Array.isArray(result) ? result[0] || null : result || null;
          })
          .catch((error) => {
            companyResult = { _error: error.message || String(error) };
          })
      );
    }

    if (includeProjects) {
      tasks.push(
        safeList(
          client,
          'projects',
          { q: { $or: [{ clientId: resolvedPersonId }, { personId: resolvedPersonId }] }, limit: 200 },
          business
        ).then((result) => {
          projects = result;
        })
      );
    }

    if (includeInvoices) {
      tasks.push(
        safeList(
          client,
          'invoices',
          { q: { $or: [{ clientId: resolvedPersonId }, { personId: resolvedPersonId }] }, limit: 200 },
          business
        ).then((result) => {
          invoices = result;
        })
      );
    }

    if (includeSubscriptions) {
      tasks.push(
        safeList(
          client,
          'invoice-subscriptions',
          { q: { $or: [{ clientId: resolvedPersonId }, { personId: resolvedPersonId }] }, limit: 200 },
          business
        ).then((result) => {
          subscriptions = result;
        })
      );
    }

    await Promise.all(tasks);

    const out = {
      person: {
        _id: person._id,
        name: person.name,
        contactEmails: person.contactEmails,
        contactPhones: person.contactPhones,
        role: person.role,
        status: person.status,
        tags: person.tags,
        companyId
      },
      company: companyResult
        ? {
            _id: companyResult._id,
            title: companyResult.title || companyResult.name,
            contactEmails: companyResult.contactEmails,
            error: companyResult._error
          }
        : null
    };

    if (Array.isArray(projects)) {
      out.projects = {
        count: projects.length,
        items: projects.map((p) => ({
          _id: p?._id,
          name: p?.name || p?.title,
          status: p?.status,
          createdAt: p?.createdAt,
          updatedAt: p?.updatedAt
        }))
      };
    } else if (projects && projects._error) {
      out.projects = { error: projects._error };
    }

    if (Array.isArray(invoices)) {
      const totals = pickInvoiceTotals(invoices);
      out.invoices = {
        count: invoices.length,
        totals,
        items: invoices.map((inv) => ({
          _id: inv?._id,
          invoiceId: inv?.invoiceId,
          amount: inv?.amount,
          currency: inv?.currency,
          status: inv?.status,
          dueDate: inv?.dueDate,
          paidAt: inv?.paidAt
        }))
      };
    } else if (invoices && invoices._error) {
      out.invoices = { error: invoices._error };
    }

    if (Array.isArray(subscriptions)) {
      out.subscriptions = {
        count: subscriptions.length,
        items: subscriptions.map((sub) => ({
          _id: sub?._id,
          title: sub?.title,
          amount: sub?.amount,
          currency: sub?.currency,
          status: sub?.status,
          upcomingInvoiceDate: sub?.upcomingInvoiceDate
        }))
      };
    } else if (subscriptions && subscriptions._error) {
      out.subscriptions = { error: subscriptions._error };
    }

    return out;
  };
}

module.exports = {
  createClient360
};
