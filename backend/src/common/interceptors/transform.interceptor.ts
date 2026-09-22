import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

export interface Response<T> {
  success: boolean;
  data: T;
  pagination?: any;
  meta: {
    timestamp: string;
    requestId: string;
  };
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const requestId = uuidv4();

    return next.handle().pipe(
      map((response) => {
        // If response already has success field, preserve its structure
        if (response && typeof response === 'object' && 'success' in response) {
          return {
            ...response,
            meta: {
              timestamp: new Date().toISOString(),
              requestId,
            },
          };
        }

        // Otherwise wrap in standard envelope
        return {
          success: true,
          data: response,
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
          },
        };
      }),
    );
  }
}
