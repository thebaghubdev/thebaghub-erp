import { UserType } from '../enums/user-type.enum';

export type JwtUser = {
  userId: string;
  username: string;
  userType: UserType;
  isAdmin: boolean;
};
