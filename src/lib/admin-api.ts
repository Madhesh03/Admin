/**
 * ============================================================================
 *  admin-api.ts — THE SEAM (facade)
 * ============================================================================
 * The single module every screen imports. It re-exports the public API surface
 * and dispatches each call to one of two interchangeable implementations:
 *
 *   • admin-api.mock.ts — in-memory, localStorage-backed demo data
 *   • admin-api.real.ts — real HTTP calls to the SOIS Django/DRF backend
 *
 * Selection is by `USE_MOCKS` (NEXT_PUBLIC_USE_MOCKS, see http.ts / .env.local),
 * resolved at module load. Because both modules expose identical signatures,
 * swapping is a config change — no screen imports change.
 *
 * Shared primitives (ApiError, Page) live in http.ts so `instanceof ApiError`
 * holds in both modes. Input DTOs live in the mock module (contract source).
 */
import { USE_MOCKS } from "./http";
import * as mock from "./admin-api.mock";
import * as real from "./admin-api.real";

/* -------------------------------------------------------------------------- */
/* Types / primitives                                                         */
/* -------------------------------------------------------------------------- */

export { USE_MOCKS };
export { ApiError, type Page } from "./http";
export type {
  ListProductsParams,
  ProductWriteInput,
  BulkPriceOp,
  BulkProductChanges,
  BulkUpdateProductsInput,
  PresignInput,
  ConfirmMediaInput,
  CategoryImagePresignInput,
  ConfirmCategoryImageInput,
  CategoryInput,
  CollectionInput,
  SupplierInput,
  PurchaseOrderCreateInput,
  ListOrdersParams,
  ListReturnsParams,
  StaffCreateInput,
} from "./admin-api.mock";

/* -------------------------------------------------------------------------- */
/* Mock-only / session helpers (safe in both modes)                          */
/* -------------------------------------------------------------------------- */

// Error-simulation toggles are demo affordances — no-ops against a real API.
export const setErrorSimulation = mock.setErrorSimulation;
export const isErrorSimulationOn = mock.isErrorSimulationOn;
// Reads the shared session store, so it reflects the real session too.
export const sessionPermissions = mock.sessionPermissions;
// Reseeds the local demo store; meaningful only in mock mode.
export const resetDemoData = mock.resetDemoData;
// Pure helper.
export const primaryImageKey = mock.primaryImageKey;

/* -------------------------------------------------------------------------- */
/* Dispatched endpoints                                                       */
/* -------------------------------------------------------------------------- */

/* Products */
export const listProducts = USE_MOCKS ? mock.listProducts : real.listProducts;
export const getProduct = USE_MOCKS ? mock.getProduct : real.getProduct;
export const createProduct = USE_MOCKS ? mock.createProduct : real.createProduct;
export const updateProduct = USE_MOCKS ? mock.updateProduct : real.updateProduct;
export const bulkUpdateProducts = USE_MOCKS ? mock.bulkUpdateProducts : real.bulkUpdateProducts;
export const archiveProduct = USE_MOCKS ? mock.archiveProduct : real.archiveProduct;

/* Media */
export const presignMedia = USE_MOCKS ? mock.presignMedia : real.presignMedia;
export const confirmMedia = USE_MOCKS ? mock.confirmMedia : real.confirmMedia;
export const deleteMedia = USE_MOCKS ? mock.deleteMedia : real.deleteMedia;

/* Categories */
export const listCategories = USE_MOCKS ? mock.listCategories : real.listCategories;
export const createCategory = USE_MOCKS ? mock.createCategory : real.createCategory;
export const updateCategory = USE_MOCKS ? mock.updateCategory : real.updateCategory;
export const presignCategoryImage = USE_MOCKS ? mock.presignCategoryImage : real.presignCategoryImage;
export const confirmCategoryImage = USE_MOCKS ? mock.confirmCategoryImage : real.confirmCategoryImage;

/* Collections */
export const listCollections = USE_MOCKS ? mock.listCollections : real.listCollections;
export const createCollection = USE_MOCKS ? mock.createCollection : real.createCollection;
export const updateCollection = USE_MOCKS ? mock.updateCollection : real.updateCollection;

/* Reviews */
export const listReviews = USE_MOCKS ? mock.listReviews : real.listReviews;
export const approveReview = USE_MOCKS ? mock.approveReview : real.approveReview;

/* Suppliers */
export const listSuppliers = USE_MOCKS ? mock.listSuppliers : real.listSuppliers;
export const getSupplier = USE_MOCKS ? mock.getSupplier : real.getSupplier;
export const createSupplier = USE_MOCKS ? mock.createSupplier : real.createSupplier;
export const updateSupplier = USE_MOCKS ? mock.updateSupplier : real.updateSupplier;

/* Purchase orders */
export const listPurchaseOrders = USE_MOCKS ? mock.listPurchaseOrders : real.listPurchaseOrders;
export const getPurchaseOrder = USE_MOCKS ? mock.getPurchaseOrder : real.getPurchaseOrder;
export const createPurchaseOrder = USE_MOCKS ? mock.createPurchaseOrder : real.createPurchaseOrder;
export const confirmPurchaseOrder = USE_MOCKS ? mock.confirmPurchaseOrder : real.confirmPurchaseOrder;
export const cancelPurchaseOrder = USE_MOCKS ? mock.cancelPurchaseOrder : real.cancelPurchaseOrder;
export const receivePurchaseOrder = USE_MOCKS ? mock.receivePurchaseOrder : real.receivePurchaseOrder;

/* Stock */
export const listLowStock = USE_MOCKS ? mock.listLowStock : real.listLowStock;
export const stockValuation = USE_MOCKS ? mock.stockValuation : real.stockValuation;
export const productLedger = USE_MOCKS ? mock.productLedger : real.productLedger;
export const adjustStock = USE_MOCKS ? mock.adjustStock : real.adjustStock;

/* Orders */
export const listOrders = USE_MOCKS ? mock.listOrders : real.listOrders;
export const getOrder = USE_MOCKS ? mock.getOrder : real.getOrder;
export const updateOrderStatus = USE_MOCKS ? mock.updateOrderStatus : real.updateOrderStatus;

/* Returns */
export const listReturns = USE_MOCKS ? mock.listReturns : real.listReturns;
export const getReturn = USE_MOCKS ? mock.getReturn : real.getReturn;
export const approveReturn = USE_MOCKS ? mock.approveReturn : real.approveReturn;
export const rejectReturn = USE_MOCKS ? mock.rejectReturn : real.rejectReturn;
export const retryReturnPickup = USE_MOCKS ? mock.retryReturnPickup : real.retryReturnPickup;
export const receiveReturn = USE_MOCKS ? mock.receiveReturn : real.receiveReturn;
export const inspectReturn = USE_MOCKS ? mock.inspectReturn : real.inspectReturn;

/* Refunds */
export const listRefunds = USE_MOCKS ? mock.listRefunds : real.listRefunds;
export const initiateRefund = USE_MOCKS ? mock.initiateRefund : real.initiateRefund;

/* Shipping */
export const listShipments = USE_MOCKS ? mock.listShipments : real.listShipments;
export const getShipment = USE_MOCKS ? mock.getShipment : real.getShipment;
export const createShipment = USE_MOCKS ? mock.createShipment : real.createShipment;
export const syncShipment = USE_MOCKS ? mock.syncShipment : real.syncShipment;
export const cancelShipment = USE_MOCKS ? mock.cancelShipment : real.cancelShipment;

/* Staff & roles */
export const listRoles = USE_MOCKS ? mock.listRoles : real.listRoles;
export const listStaff = USE_MOCKS ? mock.listStaff : real.listStaff;
export const getStaff = USE_MOCKS ? mock.getStaff : real.getStaff;
export const createStaff = USE_MOCKS ? mock.createStaff : real.createStaff;
export const updateStaffRole = USE_MOCKS ? mock.updateStaffRole : real.updateStaffRole;

/* Auth */
export const login = USE_MOCKS ? mock.login : real.login;
export const logout = USE_MOCKS ? mock.logout : real.logout;
export const getSession = USE_MOCKS ? mock.getSession : real.getSession;

/* Dashboard + customers */
export const getStats = USE_MOCKS ? mock.getStats : real.getStats;
export const listCustomers = USE_MOCKS ? mock.listCustomers : real.listCustomers;
export const getCustomer = USE_MOCKS ? mock.getCustomer : real.getCustomer;
