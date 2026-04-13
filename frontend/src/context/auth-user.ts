export type AuthUser = {
  id: string
  username: string
  userType: string
  isAdmin: boolean
  employee: {
    firstName: string
    lastName: string
    position: string
  } | null
  client: {
    firstName: string
    lastName: string
    email: string
  } | null
}
