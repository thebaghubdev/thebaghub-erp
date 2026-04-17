import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { SubmitConsignmentInquiryItemDto } from './submit-consignment-inquiry.dto';

const MAX_ITEMS = 10;

export class SubmitWalkInConsignmentInquiryDto {
  @IsUUID('4')
  consignorClientId: string;

  @IsString()
  @IsIn(['Pasig', 'Makati'])
  walkInBranch: string;

  @ValidateNested({ each: true })
  @Type(() => SubmitConsignmentInquiryItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ITEMS)
  items: SubmitConsignmentInquiryItemDto[];
}
