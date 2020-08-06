import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpHeaders, HTTP_INTERCEPTORS, HttpResponse, HttpXsrfTokenExtractor } from '@angular/common/http';
import { DspaceRestService } from '../dspace-rest/dspace-rest.service';
import { RestRequestMethod } from '../data/rest-request-method';
import { CookieService } from '../services/cookie.service';
import { CookieServiceMock } from '../../shared/mocks/cookie.service.mock';
import { XsrfInterceptor } from './xsrf.interceptor';

/**
 * A Mock TokenExtractor which just returns whatever token it is initialized with.
 * This mock object is injected into our XsrfInterceptor, so that it always finds
 * the same fake XSRF token.
 */
class MockTokenExtractor extends HttpXsrfTokenExtractor {
  constructor(private token: string | null) { super(); }

  getToken(): string | null { return this.token; }
}

describe(`XsrfInterceptor`, () => {
  let service: DspaceRestService;
  let httpMock: HttpTestingController;
  let cookieService: CookieService;

  // Create a MockTokenExtractor which always returns "test-token". This will
  // be used as the test HttpXsrfTokenExtractor, see below.
  const testToken = 'test-token';
  const mockTokenExtractor = new MockTokenExtractor(testToken);

  // Mock payload/statuses are dummy content as we are not testing the results
  // of any below requests. We are only testing for X-XSRF-TOKEN header.
  const mockPayload = {
    id: 1
  };
  const mockStatusCode = 200;
  const mockStatusText = 'SUCCESS';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        DspaceRestService,
        {
          provide: HTTP_INTERCEPTORS,
          useClass: XsrfInterceptor,
          multi: true,
        },
        { provide: HttpXsrfTokenExtractor, useValue: mockTokenExtractor },
        { provide: CookieService, useValue: new CookieServiceMock() }
      ],
    });

    service = TestBed.get(DspaceRestService);
    httpMock = TestBed.get(HttpTestingController);
    cookieService = TestBed.get(CookieService);
  });

  it('should change withCredentials to true at all times', (done) => {
    service.request(RestRequestMethod.POST, 'server/api/core/items', 'test', { withCredentials: false }).subscribe((response) => {
      expect(response).toBeTruthy();
      done();
    });

    const httpRequest = httpMock.expectOne('server/api/core/items');
    expect(httpRequest.request.withCredentials).toBeTrue();

    httpRequest.flush(mockPayload, { status: mockStatusCode, statusText: mockStatusText });
  });

  it('should add an X-XSRF-TOKEN header when we are sending an HTTP POST request', (done) => {
    service.request(RestRequestMethod.POST, 'server/api/core/items', 'test').subscribe((response) => {
      expect(response).toBeTruthy();
      done();
    });

    const httpRequest = httpMock.expectOne('server/api/core/items');

    expect(httpRequest.request.headers.has('X-XSRF-TOKEN')).toBeTrue();
    expect(httpRequest.request.withCredentials).toBeTrue();
    const token = httpRequest.request.headers.get('X-XSRF-TOKEN');
    expect(token).toBeDefined();
    expect(token).toBe(testToken.toString());

    httpRequest.flush(mockPayload, { status: mockStatusCode, statusText: mockStatusText });
  });

  it('should NOT add an X-XSRF-TOKEN header when we are sending an HTTP GET request', (done) => {
    service.request(RestRequestMethod.GET, 'server/api/core/items').subscribe((response) => {
      expect(response).toBeTruthy();
      done();
    });

    const httpRequest = httpMock.expectOne('server/api/core/items');

    expect(httpRequest.request.headers.has('X-XSRF-TOKEN')).toBeFalse();
    expect(httpRequest.request.withCredentials).toBeTrue();

    httpRequest.flush(mockPayload, { status: mockStatusCode, statusText: mockStatusText });
  });

  it('should NOT add an X-XSRF-TOKEN header when we are sending an HTTP POST to an untrusted URL', (done) => {
    // POST to a URL which is NOT our REST API
    service.request(RestRequestMethod.POST, 'https://untrusted.com', 'test').subscribe((response) => {
      expect(response).toBeTruthy();
      done();
    });

    const httpRequest = httpMock.expectOne('https://untrusted.com');

    expect(httpRequest.request.headers.has('X-XSRF-TOKEN')).toBeFalse();
    expect(httpRequest.request.withCredentials).toBeTrue();

    httpRequest.flush(mockPayload, { status: mockStatusCode, statusText: mockStatusText });
  });

  it('should update XSRF-TOKEN cookie when DSPACE-XSRF-TOKEN header found in response', (done) => {
    // Create a mock XSRF token to be returned in response within DSPACE-XSRF-TOKEN header
    const mockNewXSRFToken = '123456789abcdefg';

    service.request(RestRequestMethod.GET, 'server/api/core/items').subscribe((response) => {
      expect(response).toBeTruthy();

      // ensure mock data (added in below flush() call) is returned.
      expect(response.statusCode).toBe(mockStatusCode);
      expect(response.statusText).toBe(mockStatusText);

      // ensure mock XSRF token is in response
      expect(response.headers.has('DSPACE-XSRF-TOKEN')).toBeTrue();
      const token = response.headers.get('DSPACE-XSRF-TOKEN');
      expect(token).toBeDefined();
      expect(token).toBe(mockNewXSRFToken.toString());

      // ensure our XSRF-TOKEN cookie exists & has the same value as the new DSPACE-XSRF-TOKEN header
      expect(cookieService.get('XSRF-TOKEN')).toBeDefined();
      expect(cookieService.get('XSRF-TOKEN')).toBe(mockNewXSRFToken.toString());

      done();
    });

    const httpRequest = httpMock.expectOne('server/api/core/items');

    // Flush & create mock response (including sending back a new XSRF token in header)
    httpRequest.flush(mockPayload, {
      headers: new HttpHeaders().set('DSPACE-XSRF-TOKEN', mockNewXSRFToken),
      status: mockStatusCode,
      statusText: mockStatusText
    });
  });

});
