import {
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../errors/app-error.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function run(exception: unknown) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const req = { id: 'req-12345678', method: 'GET', originalUrl: '/api/x?q=1' };
  const host = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status: res.status.mock.calls[0][0] as number, body: res.json.mock.calls[0][0] };
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterAll(() => vi.restoreAllMocks());

  it('keeps AppError code, message and details, and adds the request ID', () => {
    const { status, body } = run(AppError.validation([{ path: 'text', message: 'Required' }]));
    expect(status).toBe(400);
    expect(body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: [{ path: 'text', message: 'Required' }],
        requestId: 'req-12345678',
      },
    });
  });

  it.each([
    [new NotFoundException('Cannot GET /api/x'), 404, 'NOT_FOUND', 'Resource not found'],
    [
      new BadRequestException('Unexpected token } in JSON'),
      400,
      'BAD_REQUEST',
      'Malformed request',
    ],
    [new ThrottlerException(), 429, 'RATE_LIMITED', 'Too many requests, please slow down'],
  ])('maps framework %s to a stable code and message', (exception, status, code, message) => {
    expect(run(exception)).toEqual({
      status,
      body: { error: { code, message, requestId: 'req-12345678' } },
    });
  });

  it('maps body-parser http-errors (e.g. 413) by status', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
      type: 'entity.too.large',
    });
    expect(run(tooLarge).body.error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('maps Prisma "record not found" to 404 without leaking the query', () => {
    const err = new Prisma.PrismaClientKnownRequestError('No record found for query on `doctors`', {
      code: 'P2025',
      clientVersion: 'test',
    });
    const { status, body } = run(err);
    expect(status).toBe(404);
    expect(JSON.stringify(body)).not.toContain('doctors');
  });

  it.each([
    new Error('connect ECONNREFUSED 10.0.0.5:5432'),
    new InternalServerErrorException('db password rejected'),
    'a thrown string',
  ])('hides internals of unexpected errors behind a generic 500 (%s)', (exception) => {
    const { status, body } = run(exception);
    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Something went wrong on our side. Please try again.');
    expect(body.error.requestId).toBe('req-12345678');
  });
});
