export interface ComplaintIntakeInput {
  customerName: string;
  customerEmail?: string;
  source: string;
  subject: string;
  message: string;
  orderId?: string;
  orderValue?: number;
  createdAt?: string | Date;
  rating?: number;
  originalReviewDate?: string;
}

export interface ComplaintInsertValues {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  source: string;
  subject: string;
  message: string;
  category: string;
  rootCause: string;
  urgency: string;
  status: string;
  confidence: number;
  sentiment: string;
  orderId: string;
  orderValue: number;
  recommendation: string;
  recommendedAmount: number;
  assignedTo: string;
  createdAt?: Date;
  rating: number;
}

export interface ComplaintIntakeStore<TComplaint extends { id: string }> {
  findCustomerByEmail(email: string): Promise<{ id: string } | undefined>;
  createCustomer(name: string, email: string): Promise<{ id: string }>;
  incrementComplaintCount(customerId: string): Promise<void>;
  findOrder(orderId: string): Promise<{ total: number } | undefined>;
  insertComplaint(values: ComplaintInsertValues): Promise<TComplaint>;
  recordEvent(
    caseId: string,
    action: string,
    actor: string,
    details: string,
  ): Promise<void>;
  makeId(prefix: string): string;
}

export async function createComplaintIntake<TComplaint extends { id: string }>(
  input: ComplaintIntakeInput,
  store: ComplaintIntakeStore<TComplaint>,
): Promise<TComplaint> {
  const email = input.customerEmail?.trim().toLowerCase() ?? "";
  let customer = email
    ? await store.findCustomerByEmail(email)
    : undefined;
  if (!customer) {
    customer = await store.createCustomer(input.customerName.trim(), email);
  }
  await store.incrementComplaintCount(customer.id);

  const matchingOrder = input.orderId
    ? await store.findOrder(input.orderId)
    : undefined;
  const createdAt = input.createdAt
    ? input.createdAt instanceof Date
      ? input.createdAt
      : new Date(input.createdAt)
    : undefined;
  if (createdAt && !Number.isFinite(createdAt.getTime())) {
    throw new Error("Complaint received date must be a valid date.");
  }

  const created = await store.insertComplaint({
    id: store.makeId("CS"),
    customerId: customer.id,
    customerName: input.customerName.trim(),
    customerEmail: email,
    source: input.source.trim(),
    subject: input.subject.trim(),
    message: input.message.trim(),
    category: "Unclassified",
    rootCause: "Needs investigation",
    urgency: "Medium",
    status: "New",
    confidence: 0,
    sentiment: "Unknown",
    orderId: input.orderId?.trim() ?? "",
    orderValue: input.orderValue ?? matchingOrder?.total ?? 0,
    recommendation: "AI review pending",
    recommendedAmount: 0,
    assignedTo: "Unassigned",
    ...(createdAt ? { createdAt } : {}),
    rating: input.rating ?? 0,
  });

  await store.recordEvent(
    created.id,
    "Complaint received",
    "CoSolve",
    `Received from ${input.source.trim()}.` + (input.originalReviewDate
      ? ` Original review date in file: ${input.originalReviewDate}. The export reference date was not supplied; the received date records import time, not an inferred review date.`
      : ""),
  );
  return created;
}
