const AMOUNT_OPS = {
  '=': (balance, amount) => balance === amount,
  '>': (balance, amount) => balance > amount,
  '<': (balance, amount) => balance < amount,
  '>=': (balance, amount) => balance >= amount,
  '<=': (balance, amount) => balance <= amount,
};

function matchesAmountFilter(balance, operator, rawAmount) {
  if (Number.isNaN(rawAmount) || !operator) return true;
  const compare = AMOUNT_OPS[operator];
  return compare ? compare(balance, rawAmount) : true;
}

function matchesSearch(account, search) {
  if (search === '') return true;
  const nameMatch = account.accountName && account.accountName.toLowerCase().includes(search);
  const numberMatch = account.accountNumber && account.accountNumber.toString().includes(search);
  return nameMatch || numberMatch;
}

export function accountMatchesFilters(account, filters, searchQuery) {
  const search = searchQuery.trim().toLowerCase();
  const typedName = filters.accountName.trim().toLowerCase();
  const typedNumber = filters.accountNumber.trim();
  const rawAmount = filters.amountValue === '' ? NaN : Number(filters.amountValue);
  const balance = Number(account.currentBalance ?? account.initBalance ?? 0);

  const matchesName =
    typedName === '' ||
    (account.accountName && account.accountName.toLowerCase().includes(typedName));

  const matchesNumber =
    typedNumber === '' ||
    (account.accountNumber && account.accountNumber.toString().includes(typedNumber));

  const matchesCategory = filters.category === '' || account.type === filters.category;
  const matchesSubCategory = filters.subCategory === '' || account.subType === filters.subCategory;
  const matchesStatus =
    filters.status === '' ||
    (filters.status === 'Active' ? account.active : !account.active);

  return (
    matchesSearch(account, search) &&
    matchesName &&
    matchesNumber &&
    matchesCategory &&
    matchesSubCategory &&
    matchesAmountFilter(balance, filters.amountOperator, rawAmount) &&
    matchesStatus
  );
}

export function buildCoaActiveTokens(searchQuery, filters) {
  return [
    searchQuery ? { key: 'searchQuery', label: `Search: ${searchQuery}` } : null,
    filters.accountName ? { key: 'accountName', label: `Name: ${filters.accountName}` } : null,
    filters.accountNumber ? { key: 'accountNumber', label: `Number: ${filters.accountNumber}` } : null,
    filters.category ? { key: 'category', label: `Category: ${filters.category}` } : null,
    filters.subCategory ? { key: 'subCategory', label: `Subcategory: ${filters.subCategory}` } : null,
    filters.amountOperator && filters.amountValue !== ''
      ? {
          key: 'amount',
          label: `Amount ${filters.amountOperator} ${Number(filters.amountValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        }
      : null,
    filters.status ? { key: 'status', label: `Status: ${filters.status}` } : null,
  ].filter(Boolean);
}
