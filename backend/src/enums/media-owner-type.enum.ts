/** Parent record that owns a media row (polymorphic association). */
export enum MediaOwnerType {
  INQUIRY = 'inquiry',
  INVENTORY_ITEM = 'inventory_item',
  ITEM_PHOTOSHOOT = 'item_photoshoot',
  ITEM_POSTING = 'item_posting',
  ORDER = 'order',
  ORDER_INSTALLMENT = 'order_installment',
  CLIENT = 'client',
  ITEM_AUTHENTICATION_METRIC = 'item_authentication_metric',
}
