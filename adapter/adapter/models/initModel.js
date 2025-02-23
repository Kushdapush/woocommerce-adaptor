/**
 * ONDC Init API Models
 * Defines schemas for validating init API requests
 */

const Joi = require('joi');

// Schema for ONDC init request validation
const initRequestSchema = Joi.object({
  context: Joi.object({
    domain: Joi.string().required(),
    action: Joi.string().valid('init').required(),
    core_version: Joi.string().required(),
    bap_id: Joi.string().required(),
    bap_uri: Joi.string().uri().required(),
    bpp_id: Joi.string().required(),
    bpp_uri: Joi.string().uri().required(),
    transaction_id: Joi.string().required(),
    message_id: Joi.string().required(),
    city: Joi.string(),
    country: Joi.string(),
    timestamp: Joi.string().isoDate().required(),
    ttl: Joi.string()
  }).required(),
  message: Joi.object({
    order: Joi.object({
      provider: Joi.object({
        id: Joi.string().required(),
        locations: Joi.array().items(
          Joi.object({
            id: Joi.string().required()
          })
        )
      }).required(),
      items: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          fulfillment_id: Joi.string().required(),
          quantity: Joi.object({
            count: Joi.number().integer().required()
          }).required(),
          parent_item_id: Joi.string(),
          tags: Joi.array().items(
            Joi.object({
              code: Joi.string().required(),
              list: Joi.array().items(
                Joi.object({
                  code: Joi.string().required(),
                  value: Joi.string().required()
                })
              )
            })
          )
        })
      ).required(),
      billing: Joi.object({
        name: Joi.string().required(),
        address: Joi.object({
          name: Joi.string(),
          building: Joi.string(),
          locality: Joi.string(),
          city: Joi.string().required(),
          state: Joi.string().required(),
          country: Joi.string().required(),
          area_code: Joi.string().required()
        }).required(),
        tax_number: Joi.string(),
        email: Joi.string().email().required(),
        phone: Joi.string().required(),
        created_at: Joi.string().isoDate(),
        updated_at: Joi.string().isoDate()
      }).required(),
      fulfillments: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          type: Joi.string().required(),
          end: Joi.object({
            location: Joi.object({
              gps: Joi.string(),
              address: Joi.object({
                name: Joi.string(),
                building: Joi.string(),
                locality: Joi.string(),
                city: Joi.string().required(),
                state: Joi.string().required(),
                country: Joi.string().required(),
                area_code: Joi.string().required()
              }).required()
            }).required(),
            contact: Joi.object({
              phone: Joi.string().required()
            }).required()
          }).required()
        })
      ).required(),
      offers: Joi.array().items(
        Joi.object({
          id: Joi.string().required()
        })
      )
    }).required()
  }).required()
});

module.exports = {
  initRequestSchema
};
