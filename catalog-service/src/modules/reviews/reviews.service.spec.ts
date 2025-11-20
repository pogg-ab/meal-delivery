import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Review } from '../../entities/review.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Order } from '../../entities/order.entity';
import { MenuCategory } from '../../entities/menu-category.entity';
import { Restaurant } from '../../entities/restaurant.entity';
import { KafkaProvider } from '../../providers/kafka.provider';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let reviewRepository: any;
  let menuItemRepository: any;
  let orderRepository: any;
  let categoryRepository: any;
  let restaurantRepository: any;
  let kafkaProvider: any;

  const mockReviewRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softRemove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockMenuItemRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockOrderRepository = {
    findOne: jest.fn(),
  };

  const mockCategoryRepository = {
    find: jest.fn(),
  };

  const mockRestaurantRepository = {
    update: jest.fn(),
    findOneBy: jest.fn(),
  };

  const mockKafkaProvider = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getRepositoryToken(Review), useValue: mockReviewRepository },
        { provide: getRepositoryToken(MenuItem), useValue: mockMenuItemRepository },
        { provide: getRepositoryToken(Order), useValue: mockOrderRepository },
        { provide: getRepositoryToken(MenuCategory), useValue: mockCategoryRepository },
        { provide: getRepositoryToken(Restaurant), useValue: mockRestaurantRepository },
        { provide: KafkaProvider, useValue: mockKafkaProvider },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
    reviewRepository = module.get(getRepositoryToken(Review));
    menuItemRepository = module.get(getRepositoryToken(MenuItem));
    orderRepository = module.get(getRepositoryToken(Order));
    categoryRepository = module.get(getRepositoryToken(MenuCategory));
    restaurantRepository = module.get(getRepositoryToken(Restaurant));
    kafkaProvider = module.get(KafkaProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createDto = {
      menu_item_id: 'menu-item-123',
      rating: 5,
      comment: 'Excellent food!',
    };

    const customerId = 'customer-123';
    const customerName = 'John Doe';

    it('should create a review successfully', async () => {
      const menuItem = { id: 'menu-item-123', name: 'Doro Wat' };
      const savedReview = {
        id: 'review-123',
        ...createDto,
        customer_id: customerId,
        customer_name: customerName,
        is_verified_purchase: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockMenuItemRepository.findOne.mockResolvedValue(menuItem);
      mockReviewRepository.findOne.mockResolvedValue(null); // No existing review
      mockReviewRepository.create.mockReturnValue(savedReview);
      mockReviewRepository.save.mockResolvedValue(savedReview);
      mockReviewRepository.find.mockResolvedValue([savedReview]);

      const result = await service.create(customerId, customerName, createDto);

      expect(result).toEqual(expect.objectContaining({
        id: 'review-123',
        rating: 5,
        comment: 'Excellent food!',
      }));
      expect(mockKafkaProvider.emit).toHaveBeenCalledWith('review.created', expect.any(Object));
    });

    it('should throw NotFoundException if menu item does not exist', async () => {
      mockMenuItemRepository.findOne.mockResolvedValue(null);

      await expect(service.create(customerId, customerName, createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if review already exists', async () => {
      const menuItem = { id: 'menu-item-123' };
      const existingReview = { id: 'existing-review' };

      mockMenuItemRepository.findOne.mockResolvedValue(menuItem);
      mockReviewRepository.findOne.mockResolvedValue(existingReview);

      await expect(service.create(customerId, customerName, createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    const updateDto = {
      rating: 4,
      comment: 'Updated review',
    };

    it('should update a review successfully', async () => {
      const review = {
        id: 'review-123',
        customer_id: 'customer-123',
        menu_item_id: 'menu-item-123',
        rating: 5,
        comment: 'Original review',
        deleted_at: null,
      };

      const updatedReview = { ...review, ...updateDto, updated_at: new Date() };

      mockReviewRepository.findOne.mockResolvedValue(review);
      mockReviewRepository.save.mockResolvedValue(updatedReview);
      mockReviewRepository.find.mockResolvedValue([updatedReview]);

      const result = await service.update('customer-123', 'review-123', updateDto);

      expect(result.rating).toBe(4);
      expect(result.comment).toBe('Updated review');
      expect(mockKafkaProvider.emit).toHaveBeenCalledWith('review.updated', expect.any(Object));
    });

    it('should throw ForbiddenException if user is not the owner', async () => {
      const review = {
        id: 'review-123',
        customer_id: 'different-customer',
        deleted_at: null,
      };

      mockReviewRepository.findOne.mockResolvedValue(review);

      await expect(service.update('customer-123', 'review-123', updateDto)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('delete', () => {
    it('should delete a review successfully', async () => {
      const review = {
        id: 'review-123',
        customer_id: 'customer-123',
        menu_item_id: 'menu-item-123',
      };

      mockReviewRepository.findOne.mockResolvedValue(review);
      mockReviewRepository.softRemove.mockResolvedValue(review);
      mockReviewRepository.find.mockResolvedValue([]);

      await service.delete('customer-123', 'review-123');

      expect(mockReviewRepository.softRemove).toHaveBeenCalledWith(review);
      expect(mockKafkaProvider.emit).toHaveBeenCalledWith('review.deleted', expect.any(Object));
    });

    it('should throw ForbiddenException if user is not the owner', async () => {
      const review = {
        id: 'review-123',
        customer_id: 'different-customer',
      };

      mockReviewRepository.findOne.mockResolvedValue(review);

      await expect(service.delete('customer-123', 'review-123')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getMenuItemReviews', () => {
    it('should return menu item reviews with statistics', async () => {
      const menuItem = {
        id: 'menu-item-123',
        name: 'Doro Wat',
      };

      const reviews = [
        { id: 'review-1', rating: 5, menu_item_id: 'menu-item-123', deleted_at: null },
        { id: 'review-2', rating: 4, menu_item_id: 'menu-item-123', deleted_at: null },
        { id: 'review-3', rating: 5, menu_item_id: 'menu-item-123', deleted_at: null },
      ];

      mockMenuItemRepository.findOne.mockResolvedValue(menuItem);
      mockReviewRepository.findAndCount.mockResolvedValue([reviews, 3]);
      mockReviewRepository.find.mockResolvedValue(reviews);

      const result = await service.getMenuItemReviews('menu-item-123', 1, 10);

      expect(result.menu_item_id).toBe('menu-item-123');
      expect(result.menu_item_name).toBe('Doro Wat');
      expect(result.total_reviews).toBe(3);
      expect(result.average_rating).toBeGreaterThan(4);
      expect(result.reviews).toHaveLength(3);
    });
  });

  describe('getRestaurantRating', () => {
    it('should return aggregated restaurant rating', async () => {
      const categories = [
        {
          restaurant_id: 'restaurant-123',
          restaurant: { id: 'restaurant-123', name: 'Addis Kitchen' },
          menu_items: [
            { id: 'menu-item-1' },
            { id: 'menu-item-2' },
          ],
        },
      ];

      const reviews = [
        { id: 'review-1', rating: 5, deleted_at: null },
        { id: 'review-2', rating: 4, deleted_at: null },
        { id: 'review-3', rating: 5, deleted_at: null },
      ];

      mockCategoryRepository.find.mockResolvedValue(categories);
      
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(reviews),
      };
      mockReviewRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getRestaurantRating('restaurant-123');

      expect(result.restaurant_id).toBe('restaurant-123');
      expect(result.restaurant_name).toBe('Addis Kitchen');
      expect(result.total_reviews).toBe(3);
      expect(result.average_rating).toBeGreaterThan(4);
    });
  });
});
