/** Parent record that owns a media row (polymorphic association). */
export enum MediaOwnerType {
  INQUIRY = 'inquiry',
  INVENTORY_ITEM = 'inventory_item',
  ITEM_PHOTOSHOOT = 'item_photoshoot',
  ITEM_POSTING = 'item_posting',
  ORDER = 'order',
  ORDER_INSTALLMENT = 'order_installment',
  ORDER_PAYMENT = 'order_payment',
  CLIENT = 'client',
  ITEM_AUTHENTICATION_METRIC = 'item_authentication_metric',
  CONSIGNOR_PAYMENT_GROUP = 'consignor_payment_group',
  DIRECT_PURCHASE_PAYMENT = 'direct_purchase_payment',
  WALK_IN_AUTHENTICATION = 'walk_in_authentication',
  WALK_IN_AUTHENTICATION_METRIC = 'walk_in_authentication_metric',
}
